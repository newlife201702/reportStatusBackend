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
  user: 'SA',
  password: 'pioneer769',
  server: '58.34.42.130',
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
  // appId: 'wx76b0de7432d1b270',
  // appSecret: '3a1552b60832b722001b03a6a195f298'
  appId: 'wx8617ae63d325eb21',
  appSecret: '563dc235393ea78de57b00e540bf6a3b'
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
      // 如果订单条码表中没有记录，提示"订单不存在"
      res.json({ status: 'not_found', message: '订单不存在' });
      return;
    } else {
      foundOrder = orderBarcodeResult.recordset[0];
      console.log('foundOrder', foundOrder);
    }

    // 2. 在部门未完成订单整理表中查询
    const unfinishedOrderQuery = `SELECT * FROM 部门未完成订单整理 WHERE 订单单号 = '${foundOrder.订单单号}' AND 序号 = '${foundOrder.序号}' AND 公司订单号 = '${foundOrder.公司订单号}'`;
    const unfinishedOrderResult = await sql.query(unfinishedOrderQuery);

    if (unfinishedOrderResult.recordset.length > 0) {
      console.log('unfinishedOrderResult.recordset[0]', unfinishedOrderResult.recordset[0]);
      // 如果部门未完成订单整理表中有记录，让用户上报加工状态
      res.json({ status: 'found', data: unfinishedOrderResult.recordset[0] });
    } else {
      // 如果部门未完成订单整理表中没有记录，提示"订单已完成"
      res.json({ status: 'completed', message: '订单已完成' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员二维码扫描处理
app.post('/adminScan', async (req, res) => {
  const { qrCodeData } = req.body;
  const [_, purchaseOrder, serialNumber, companyOrder] = qrCodeData.split(',');
  console.log("adminScan_qrCodeData.split(',')", qrCodeData.split(','), '_, purchaseOrder, serialNumber, companyOrder', _, purchaseOrder, serialNumber, companyOrder);

  try {
    await sql.connect(sqlConfig);

    // 1. 先在订单条码表中查询
    const orderBarcodeQuery = `SELECT * FROM 订单条码表 WHERE 采购单号 = '${purchaseOrder}' AND 采购单序号 = '${serialNumber}' AND 公司订单号 = '${companyOrder}'`;
    const orderBarcodeResult = await sql.query(orderBarcodeQuery);

    let foundOrder;
    if (orderBarcodeResult.recordset.length === 0) {
      // 如果订单条码表中没有记录，提示"订单不存在"
      res.json({ status: 'not_found', message: '订单不存在' });
      return;
    } else {
      foundOrder = orderBarcodeResult.recordset[0];
      console.log('foundOrder', foundOrder);
    }

    // 2. 在部门未完成订单整理表中查询
    const unfinishedOrderQuery = `SELECT * FROM 部门未完成订单整理 WHERE 订单单号 = '${foundOrder.订单单号}' AND 序号 = '${foundOrder.序号}' AND 公司订单号 = '${foundOrder.公司订单号}'`;
    const unfinishedOrderResult = await sql.query(unfinishedOrderQuery);

    if (unfinishedOrderResult.recordset.length > 0) {
      console.log('unfinishedOrderResult.recordset[0]', unfinishedOrderResult.recordset[0]);
      // 如果部门未完成订单整理表中有记录，继续在部门订单状态表中查询
      // 3. 在部门订单状态表中查询
      const orderStatusQuery = `SELECT TOP 1 * FROM 部门订单状态表 WHERE 订单单号 = '${foundOrder.订单单号}' AND 序号 = '${foundOrder.序号}' AND 公司订单号 = '${foundOrder.公司订单号}' ORDER BY 登记时间 DESC`;
      const orderStatusResult = await sql.query(orderStatusQuery);

      if (orderStatusResult.recordset.length > 0) {
        console.log('orderStatusResult.recordset[0]', orderStatusResult.recordset[0]);
        // 如果部门订单状态表中有记录，返回订单
        res.json({ status: 'found', data: orderStatusResult.recordset[0] });
      } else {
        // 如果部门订单状态表中没有记录，提示"订单不存在"
        res.json({ status: 'not_found', message: '订单不存在' });
      }
    } else {
      // 如果部门未完成订单整理表中没有记录，提示"订单已完成"
      res.json({ status: 'completed', message: '订单已完成' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取工序名称
app.post('/getProcessOptions', async (req, res) => {
  const { drawingNumber, materialNumber, drawingVersion, purchaseOrder, serialNumber, companyOrder } = req.body;

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

      // 按"登记时间"倒序查询数据
      const query2 = `
        SELECT TOP 1 * 
        FROM 部门订单状态表 
        WHERE 订单单号 = '${purchaseOrder}' 
          AND 序号 = '${serialNumber}' 
          AND 公司订单号 = '${companyOrder}'
        ORDER BY 登记时间 DESC
      `;
      console.log('query2', query2);
      const result2 = await sql.query(query2);
      console.log('result2', result2);
      if (result2.recordset.length === 0) {
        return res.json({ processOptions, restartProcessOptions: [processOptions[0]], alreadyProcessOptions: [] });
      }
      const record = result2.recordset[0]; // 获取第一条数据
      // 保留原始状态列表，用于 alreadyProcessOptions
      const originalAllSteps = record.加工状态 ? record.加工状态.split('→').filter(path => path.split('号')[1]).map(item2 => item2.split('号')[1]) : [];
      
      // 创建一个可修改的副本
      const allSteps = [...originalAllSteps];
      
      // 查找最后一个包含"(零件报废)"的状态的索引
      let scrapIndex = -1;
      for (let i = allSteps.length - 1; i >= 0; i--) {
        if (allSteps[i].includes('(零件报废)')) {
          scrapIndex = i;
          // 去掉该状态中的"(零件报废)"文本
          allSteps[i] = allSteps[i].replace('(零件报废)', '').trim();
          break;
        }
      }
      
      // 如果找到了报废状态，则只保留该状态及之后的状态；否则使用原来的全部状态
      const stepList = scrapIndex >= 0 ? allSteps.slice(scrapIndex) : allSteps;
      const newProcessOptions = processOptions.filter(item => !stepList.includes(item));
      res.json({ processOptions: newProcessOptions, restartProcessOptions: [processOptions[0]], alreadyProcessOptions: originalAllSteps });
    } else {
      // 按"登记时间"倒序查询数据
      const query2 = `
        SELECT TOP 1 * 
        FROM 部门订单状态表 
        WHERE 订单单号 = '${purchaseOrder}' 
          AND 序号 = '${serialNumber}' 
          AND 公司订单号 = '${companyOrder}'
        ORDER BY 登记时间 DESC
      `;
      console.log('query2', query2);
      const result2 = await sql.query(query2);
      console.log('result2', result2);
      if (result2.recordset.length === 0) {
        return res.json({ processOptions: [], restartProcessOptions: [], alreadyProcessOptions: [] });
      }
      const record = result2.recordset[0]; // 获取第一条数据
      const stepList = record.加工状态 ? record.加工状态.split('→').filter(path => path.split('号')[1]).map(item2 => item2.split('号')[1]) : [];
      res.json({ processOptions: [], restartProcessOptions: [], alreadyProcessOptions: stepList });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上报加工状态
app.post('/reportStatus', async (req, res) => {
  const { purchaseOrder, serialNumber, companyOrder, lineNumber, drawingNumber, orderName, process, photoUrl, name, department, customerCode, materialCode } = req.body;

  try {
    await sql.connect(sqlConfig);
    // const query = `
    //   UPDATE 部门订单状态表 
    //   SET 加工状态 = '${process}', 照片 = '${photoUrl}' 
    //   WHERE 订单单号 = '${purchaseOrder}' AND 序号 = '${serialNumber}' AND 公司订单号 = '${companyOrder}'
    // `;
    // await sql.query(query);

    // 1. 查询当前加工状态和照片信息
    // const query = `
    //   SELECT 加工状态, 照片 
    //   FROM 部门订单状态表 
    //   WHERE 订单单号 = '${purchaseOrder}' 
    //     AND 序号 = '${serialNumber}' 
    //     AND 公司订单号 = '${companyOrder}'
    // `;
    // const result = await sql.query(query);

    // if (result.recordset.length === 0) {
    //   return res.status(404).json({ error: '未找到订单记录' });
    // }

    // const currentProcess = result.recordset[0].加工状态 || '';
    // const currentPhoto = result.recordset[0].照片 || '';

    // 1. 按"登记时间"倒序查询数据
    const query = `
      SELECT TOP 1 * 
      FROM 部门订单状态表 
      WHERE 订单单号 = '${purchaseOrder}' 
        AND 序号 = '${serialNumber}' 
        AND 公司订单号 = '${companyOrder}'
      ORDER BY 登记时间 DESC
    `;
    const result = await sql.query(query);

    const record = result.recordset[0]; // 获取第一条数据
    console.log('部门订单状态表record', record);

    // 2. 生成新的加工状态和照片信息
    // 获取当前时间
    const now = new Date();
    // 将时间调整为东八区时间（UTC+8）
    const offset = 8; // 中国是东八区
    const today = new Date(now.getTime() + offset * 60 * 60 * 1000).toISOString().split('T')[0]; // 获取当前日期，格式为 YYYY-MM-DD
    const newProcess = record?.加工状态 ? `${record.加工状态}→${today}号${process}` : `${today}号${process}`;
    const newPhoto = record?.图片存储路径 ? `${record.图片存储路径}→${today}号${photoUrl}` : `${today}号${photoUrl}`;

    // 3. 将登记时间格式化为 SQL Server 支持的 datetime 格式（包括毫秒）
    // const registrationTime = new Date(record.登记时间).toISOString().slice(0, 23).replace('T', ' ');

    // 4. 更新第一条数据的加工状态和照片信息
    // const updateQuery = `
    //   UPDATE 部门订单状态表 
    //   SET 加工状态 = '${newProcess}', 图片存储路径 = '${newPhoto}' 
    //   WHERE 订单单号 = '${purchaseOrder}' 
    //     AND 序号 = '${serialNumber}' 
    //     AND 公司订单号 = '${companyOrder}'
    //     AND 登记时间 = '${registrationTime}'
    // `;
    // console.log('部门订单状态表updateQuery', updateQuery);
    // await sql.query(updateQuery);


    const chinaTime = new Date(now.getTime() + offset * 60 * 60 * 1000);
    // 格式化为ISO字符串并替换'T'为空格
    const chinaTimeString = chinaTime.toISOString().slice(0, 23).replace('T', ' ');

    if (result.recordset.length === 0) {
      console.log('reportStatus:未找到订单记录');
      const insertNewQuery = `INSERT INTO 部门订单状态表 (登记日期, 登记时间, 公司订单号, 行号, 图号, 名称, 加工状态, 部门, 登记人员, 序号, 订单单号, 图片存储路径, 客户编码, 物料编码) VALUES ('${chinaTimeString.slice(0, 10)}', '${chinaTimeString}', '${companyOrder}', '${lineNumber}', '${drawingNumber}', '${orderName}', '${newProcess}', '${department}', '${name}', '${serialNumber}', '${purchaseOrder}', '${newPhoto}', '${customerCode}', '${materialCode}')`;
      console.log('部门订单状态表insertNewQuery', insertNewQuery);
      await sql.query(insertNewQuery);
      return res.json({ success: true });
    }

    // 更新已存在的记录，而不是插入新记录
    // 处理登记时间、部门、登记人员字段，使用 → 累加原值
    const newRegTime = record.登记时间 ? `${record.登记时间}→${chinaTimeString}` : chinaTimeString;
    const newDepartment = record.部门 ? record.部门 : department;
    const newStaff = record.登记人员 ? `${record.登记人员}→${name}` : name;
    
    const updateQuery = `UPDATE 部门订单状态表 
      SET 加工状态 = '${newProcess}', 
          图片存储路径 = '${newPhoto}',
          登记日期 = '${chinaTimeString.slice(0, 10)}', 
          登记时间 = '${newRegTime}',
          部门 = '${newDepartment}', 
          登记人员 = '${newStaff}'
      WHERE 订单单号 = '${purchaseOrder}' 
        AND 序号 = '${serialNumber}' 
        AND 公司订单号 = '${companyOrder}'
        AND 登记时间 = '${record.登记时间}'`;
    console.log('部门订单状态表updateQuery', updateQuery);
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
      res.json({ name: results[0].name, role: results[0].role, department: results[0].department });
    } else {
      res.json({ error: '用户未注册，请联系管理员' });
    }
  });
});

// 查看订单（分页查询）
app.post('/viewOrders', async (req, res) => {
  const { role, department, page = 1, pageSize = 10, drawingNumber, name, customerCode, companyOrder, lineNumber } = req.body;

  try {
    await sql.connect(sqlConfig);

    // 1. 查询所有数据
    let query;
    if (role === '超级管理员') {
      query = `
        SELECT * 
        FROM 部门订单状态表 
        ORDER BY 订单单号, 序号, 公司订单号, 登记时间 DESC
      `;
    } else if (role === '部门管理员') {
      query = `
        SELECT * 
        FROM 部门订单状态表 
        WHERE 部门 LIKE '%${department}%' 
        ORDER BY 订单单号, 序号, 公司订单号, 登记时间 DESC
      `;
    } else {
      return res.status(403).json({ error: '无权访问' });
    }

    const result = await sql.query(query);

    // 2. 分组并取每组最新数据
    const groupedData = {};
    result.recordset.forEach((item) => {
      const key = `${item.订单单号}-${item.序号}-${item.公司订单号}`;
      if (!groupedData[key] || new Date(item.登记时间) > new Date(groupedData[key].登记时间)) {
        groupedData[key] = item;
      }
    });

    // 3. 汇总数据
    const allData = Object.values(groupedData);

    // 4. 筛选数据
    const filteredData = allData.filter((item) => {
      const matchDrawingNumber = drawingNumber ? item.图号 === drawingNumber : true;
      const matchName = name ? item.名称.includes(name) : true;
      const matchCustomerCode = customerCode ? item.客户编码 === customerCode : true;
      const matchCompanyOrder = companyOrder ? item.公司订单号 === companyOrder : true;
      const matchLineNumber = lineNumber ? item.行号 === lineNumber : true;
      // 确保加工状态不包含"检验入库"、"入库检验"、"终检"、"入库"
      const notInspectionStorage = item.加工状态 ? 
        (!item.加工状态.includes('检验入库') && 
         !item.加工状态.includes('入库检验') && 
         !item.加工状态.includes('终检') && 
         !item.加工状态.includes('入库')) : true;
      return matchDrawingNumber && matchName && matchCustomerCode && matchCompanyOrder && matchLineNumber && notInspectionStorage;
    });

    // 5. 分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    res.json({
      orders: paginatedData,
      total: filteredData.length,
      page,
      pageSize
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 保存用户信息
app.post('/saveUserInfo', (req, res) => {
  const { openid, name, role, department } = req.body;
  
  // 验证必要参数
  if (!openid || !name || !role || !department) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const connection = mysql.createConnection(mysqlConfig);
  
  // 检查用户是否已存在
  connection.query('SELECT * FROM 人员表 WHERE openid = ?', [openid], (error, results) => {
    if (error) {
      connection.end();
      return res.status(500).json({ error: error.message });
    }
    
    if (results.length > 0) {
      // 用户已存在，更新信息
      connection.query(
        'UPDATE 人员表 SET name = ?, role = ?, department = ? WHERE openid = ?',
        [name, role, department, openid],
        (updateError) => {
          connection.end();
          if (updateError) {
            return res.status(500).json({ error: updateError.message });
          }
          res.json({ success: true, message: '用户信息已更新' });
        }
      );
    } else {
      // 用户不存在，创建新用户
      connection.query(
        'INSERT INTO 人员表 (openid, name, role, department) VALUES (?, ?, ?, ?)',
        [openid, name, role, department],
        (insertError) => {
          connection.end();
          if (insertError) {
            return res.status(500).json({ error: insertError.message });
          }
          res.json({ success: true, message: '用户信息已保存' });
        }
      );
    }
  });
});

// 扫码查看订单信息
app.post('/viewOrder', async (req, res) => {
  const { role, department, purchaseOrder, serialNumber, companyOrder } = req.body;

  // 验证必要参数
  if (!role || !purchaseOrder || !serialNumber || !companyOrder) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // 验证用户权限
  if (role !== '超级管理员' && role !== '部门管理员') {
    return res.status(403).json({ error: '无权访问此接口' });
  }

  // 如果是部门管理员，则必须提供部门信息
  if (role === '部门管理员' && !department) {
    return res.status(400).json({ error: '缺少部门信息' });
  }

  try {
    await sql.connect(sqlConfig);

    // 根据角色构建不同的查询语句
    let query;
    if (role === '超级管理员') {
      query = `
        SELECT TOP 1 * 
        FROM 部门订单状态表 
        WHERE 订单单号 = '${purchaseOrder}' 
          AND 序号 = '${serialNumber}' 
          AND 公司订单号 = '${companyOrder}'
        ORDER BY 登记时间 DESC
      `;
    } else { // 部门管理员
      query = `
        SELECT TOP 1 * 
        FROM 部门订单状态表 
        WHERE 订单单号 = '${purchaseOrder}' 
          AND 序号 = '${serialNumber}' 
          AND 公司订单号 = '${companyOrder}'
          AND 部门 LIKE '%${department}%'
        ORDER BY 登记时间 DESC
      `;
    }

    const result = await sql.query(query);

    // 检查是否查询到订单信息
    if (result.recordset.length > 0) {
      // 返回订单信息
      res.json({ success: true, order: result.recordset[0] });
    } else {
      // 未查询到订单信息
      res.json({ success: false, message: '订单不存在' });
    }
  } catch (err) {
    console.error('查询订单信息出错:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(2910, () => {
  console.log('Server is running on port 2910');
});