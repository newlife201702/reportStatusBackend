const express = require('express');
const bodyParser = require('body-parser');
const sql = require('mssql');
const mysql = require('mysql');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// SQL Server 配置
const sqlConfig = {
  user: 'wxy',
  password: 'wxy000',
  server: '116.228.102.254',
  port: 14333, // 端口号
  database: '派尼',
  options: {
    encrypt: true, // 使用加密连接
    trustServerCertificate: true // 信任自签名证书
  }
};

// MySQL 配置
const mysqlConfig = {
  host: '47.117.173.54',
  user: 'reportStatus',
  password: '123456',
  database: 'reportstatus'
};

// 微信配置
const wxConfig = {
  appId: 'wx76b0de7432d1b270',
  appSecret: '3a1552b60832b722001b03a6a195f298'
};

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// 获取 openid
app.post('/getOpenid', async (req, res) => {
  const { code } = req.body;
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${wxConfig.appId}&secret=${wxConfig.appSecret}&js_code=${code}&grant_type=authorization_code`;

  try {
    const response = await axios.get(url);
    console.log('getOpenid_response.data', response.data);
    const { openid, session_key } = response.data;
    res.json({ openid, session_key });
  } catch (err) {
    res.status(500).json({ error: '获取 openid 失败' });
  }
});

// 二维码扫描处理
app.post('/scan', async (req, res) => {
  const { qrCodeData } = req.body;
  const [_, purchaseOrder, serialNumber, companyOrder] = qrCodeData.split(',');
  console.log("qrCodeData.split(',')", qrCodeData.split(','), '_, purchaseOrder, serialNumber, companyOrder', _, purchaseOrder, serialNumber, companyOrder);

  try {
    await sql.connect(sqlConfig);

    // 1. 先在订单条码表中查询
    const orderBarcodeQuery = `SELECT * FROM 订单条码表 WHERE 采购单号 = '${purchaseOrder}' AND 采购单序号 = '${serialNumber}' AND 公司订单号 = '${companyOrder}'`;
    const orderBarcodeResult = await sql.query(orderBarcodeQuery);

    let foundOrder;
    if (orderBarcodeResult.recordset.length === 0) {
      // 如果订单条码表中没有记录，提示“订单不存在”
      res.json({ status: 'not_found', message: '订单不存在' });
      return;
    } else {
      foundOrder = orderBarcodeResult.recordset[0];
    }

    // 2. 在部门未完成订单整理表中查询
    const unfinishedOrderQuery = `SELECT * FROM 部门未完成订单整理 WHERE 订单单号 = '${foundOrder.订单单号}' AND 序号 = '${foundOrder.序号}' AND 公司订单号 = '${foundOrder.公司订单号}'`;
    const unfinishedOrderResult = await sql.query(unfinishedOrderQuery);

    if (unfinishedOrderResult.recordset.length > 0) {
      console.log('unfinishedOrderResult.recordset[0]', unfinishedOrderResult.recordset[0]);
      // 如果部门未完成订单整理表中有记录，让用户上报加工状态
      res.json({ status: 'found', data: unfinishedOrderResult.recordset[0] });
    } else {
      // 如果部门未完成订单整理表中没有记录，提示“订单已完成”
      res.json({ status: 'completed', message: '订单已完成' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取工序名称
app.post('/getProcessOptions', async (req, res) => {
  const { drawingNumber, materialNumber, drawingVersion } = req.body;

  try {
    await sql.connect(sqlConfig);
    const query = `SELECT 工序名称 FROM 零件工艺内容清单 WHERE 图号 = '${drawingNumber}' AND 物料编码 = '${materialNumber}' AND 图纸版本号 = '${drawingVersion}'`;
    const result = await sql.query(query);
    console.log('result', result);

    if (result.recordset.length > 0) {
      // const processOptions = result.recordset.map(item => item.工序名称);
      // 将每个工序名称扩展为三个状态
      const processOptions = result.recordset.flatMap(item => [
        `待${item.工序名称}`,
        `${item.工序名称}中`,
        `${item.工序名称}完成`
      ]);
      res.json({ processOptions });
    } else {
      res.json({ processOptions: [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上报加工状态
app.post('/reportStatus', async (req, res) => {
  const { purchaseOrder, serialNumber, companyOrder, process, photoUrl } = req.body;

  try {
    await sql.connect(sqlConfig);
    // const query = `
    //   UPDATE 部门订单状态表 
    //   SET 加工状态 = '${process}', 照片 = '${photoUrl}' 
    //   WHERE 订单单号 = '${purchaseOrder}' AND 序号 = '${serialNumber}' AND 公司订单号 = '${companyOrder}'
    // `;
    // await sql.query(query);
    // 1. 查询当前加工状态和照片信息
    const query = `
      SELECT 加工状态, 照片 
      FROM 部门订单状态表 
      WHERE 订单单号 = '${purchaseOrder}' 
        AND 序号 = '${serialNumber}' 
        AND 公司订单号 = '${companyOrder}'
    `;
    const result = await sql.query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: '未找到订单记录' });
    }

    const currentProcess = result.recordset[0].加工状态 || '';
    const currentPhoto = result.recordset[0].照片 || '';

    // 2. 生成新的加工状态和照片信息
    const today = new Date().toISOString().split('T')[0]; // 获取当前日期，格式为 YYYY-MM-DD
    const newProcess = currentProcess ? `${currentProcess}→${today}号${process}` : `${today}号${process}`;
    const newPhoto = currentPhoto ? `${currentPhoto}→${today}号${photoUrl}` : `${today}号${photoUrl}`;

    // 3. 更新加工状态和照片信息
    const updateQuery = `
      UPDATE 部门订单状态表 
      SET 加工状态 = '${newProcess}', 照片 = '${newPhoto}' 
      WHERE 订单单号 = '${purchaseOrder}' 
        AND 序号 = '${serialNumber}' 
        AND 公司订单号 = '${companyOrder}'
    `;
    await sql.query(updateQuery);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上传照片
app.post('/uploadPhoto', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未上传照片' });
  }

  const photoUrl = `https://gongxuchaxun.weimeigu.com.cn/uploads/${req.file.filename}`;
  res.json({ url: photoUrl });
});

// 用户认证
app.post('/auth', (req, res) => {
  const { openid } = req.body;
  const connection = mysql.createConnection(mysqlConfig);
  connection.query('SELECT * FROM 人员表 WHERE openid = ?', [openid], (error, results) => {
    console.log('auth_results', results);
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (results.length > 0) {
      res.json({ role: results[0].role, department: results[0].department });
    } else {
      res.json({ error: '用户未注册，请联系管理员' });
    }
  });
});

// 查看订单（分页查询）
app.post('/viewOrders', async (req, res) => {
  const { role, department, page = 1, pageSize = 10 } = req.body;

  try {
    await sql.connect(sqlConfig);
    let query;
    if (role === '超级管理员') {
      query = `SELECT * FROM 部门订单状态表 ORDER BY 登记时间 DESC OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
    } else if (role === '部门管理员') {
      query = `SELECT * FROM 部门订单状态表 WHERE 部门 = '${department}' ORDER BY 登记时间 DESC OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
    } else {
      res.status(403).json({ error: '无权访问' });
      return;
    }

    // 查询分页数据
    const result = await sql.query(query);
    // 查询总条数
    const countQuery = role === '超级管理员' 
      ? 'SELECT COUNT(*) AS total FROM 部门订单状态表' 
      : `SELECT COUNT(*) AS total FROM 部门订单状态表 WHERE 部门 = '${department}'`;
    const countResult = await sql.query(countQuery);

    res.json({
      orders: result.recordset,
      total: countResult.recordset[0].total,
      page,
      pageSize
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});