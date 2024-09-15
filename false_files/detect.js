const fs = require('fs');
require('./globalVars');
const motorSpeed2Rule = require('./alarmRules');
const sendEmail = require('./sendmail');
const path = global.path;
let lastDate=null;
let lastLines=null;
let newDate=null;
let newLines=null;
const http = require('http');

function sendPostRequest(url,path, body) {
    const data = JSON.stringify(body);
    const options = {
        hostname: url,
        port: 8081, 
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Length': Buffer.byteLength(data, 'utf8')
        }
    };
    const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        res.on('end', () => {
            console.log('Response:', responseData);
        });
    });
    req.on('error', (error) => {
        console.error('An error occurred:', error);
    });
    // 发送请求主体
    req.write(data);
    req.end();
}

// 1.获取日期最大的文件名称
// input:
function getMaxDateFileName(files) {
  let maxDateFileName = null;
  let maxDate = null;
  files.forEach((file) => {
    const match = file.match(/detection_data_([0-9]{4}-[0-9]{2}-[0-9]{2})_false_normal\.csv/);
    // console.log('false匹配结果:', match);
    if (match) {
      const currentDate = new Date(match[1]);
      if (!maxDate || currentDate > maxDate) {
        maxDate = currentDate;
        maxDateFileName = file;
      }
    }
  });

  return { fileName: maxDateFileName, date: maxDate };
}

function getMaxTrueDateFileName(files,trueOrFalse) {
  let maxDateFileName = null;
  let maxDate = null;

  const regex = new RegExp(`detection_data_([0-9]{4}-[0-9]{2}-[0-9]{2})_${trueOrFalse}_normal\\.csv`);

  files.forEach((file) => {
    const match = file.match(regex);
    if (match) {
      const currentDate = new Date(match[1]);
      if (!maxDate || currentDate > maxDate) {
        maxDate = currentDate;
        maxDateFileName = file;
      }
    }
  });
  if (!maxDate) {
    return { fileName: null, date: null };
  }
  // 找到比最大日期小一天的文件
  // let oneDayBefore = new Date(maxDate);
  const todayDate=new Date();
  let oneDayBefore = new Date(todayDate);
  let targetFileName = null;
  do {
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);  // 日期减去一天
    const formattedDate = oneDayBefore.toISOString().split('T')[0];  // 格式化为YYYY-MM-DD
    targetFileName = `detection_data_${formattedDate}_${trueOrFalse}_normal.csv`;
    if (files.includes(targetFileName)) {
      return { fileName: targetFileName, date: oneDayBefore };
    }else{
      // console.log("targetFileName is ,",targetFileName)
    }

  } while (oneDayBefore > new Date('1970-01-01')); // 假设文件不会早于1970年
  return { fileName: null, date: null };
}

function get7TrueDateFileName(files, trueOrFalse) {
  let maxDateFileName = null;
  const todayDate=new Date();
  let maxDate = new Date(todayDate);
  //todo 修改为最新日期
  maxDate.setDate(maxDate.getDate()-7)

  // 从最大日期开始，获取前1到7天的文件名称及日期
  let results = [];
  for (let i = 1; i <= 7; i++) {
    let targetDate = new Date(maxDate);
    targetDate.setDate(targetDate.getDate() - i);  // 日期减去i天
    const formattedDate = targetDate.toISOString().split('T')[0];  // 格式化为YYYY-MM-DD
    const targetFileName = `detection_data_${formattedDate}_${trueOrFalse}_normal.csv`;

    if (files.includes(targetFileName)) {
      results.push({ fileName: targetFileName, date: targetDate });
    } else {
      results.push({ fileName: null, date: targetDate });
    }
  }
  return results;
}

// 2.读取文件内容
function readFileContent(fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(path + fileName, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
        reject(err);
        return;
      }
      const lines = data.trim().split('\n');
      const record = {};
      const headers = lines[0].split(',');
      // 只有当不为空时执行
      if (global.lastLine && global.lastLine > 0 && global.lastLine <= lines.length) {
        const lastRecord = {};
        const lastTailValues = lines[global.lastLine - 1].split(',');
        headers.forEach((header, index) => {
          const key = header.trim(); // 去除空白字符
          const lastValue = lastTailValues[index].trim(); // 去除空白字符
          lastRecord[key]=lastValue;
        });
        global.lastRecord = lastRecord;
      }
      const tailValues = lines[lines.length - 1].split(',');
      // 遍历表头，以每个表头为 key，对应的最底行元素为 value
      headers.forEach((header, index) => {
        const key = header.trim(); // 去除空白字符
        const value = tailValues[index].trim(); // 去除空白字符
        record[key] = value;
      });
      global.newRecord = record;
      // console.log('global.newRecord is:', JSON.stringify(global.newRecord, null, 2));
      resolve({ lines: lines.length });
    });
  });
}



// 3.定时执行函数，主函数
function executeFunction(callback) {
  // 获取文件夹下所有文件的文件名，并找出日期最大的一天
  fs.readdir(path, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    const { fileName: maxDateFileName, date: maxDate } = getMaxDateFileName(files);

    if (!maxDateFileName) {
      console.log('未找到符合条件的文件');
      callback();
      return;
    }

    readFileContent(maxDateFileName)
      .then((result) => {
        const { lines: maxLines } = result;
        // 读取文件，赋初值
        if (newDate == null && maxDate) {//第一次运行
          console.log('第一次执行主函数———————————————————————————————————— First Of Main Function');
          lastDate = maxDate;
          lastLines = maxLines;
          newDate = maxDate;
          newLines = maxLines;
          global.newLine = maxLines;
          global.lastLine = maxLines;
        } else if (maxDate && lastDate) {//第二次及以后运行，先给最新值赋值@@@@@@@@@@@@@@@@@@@@@@@@@
          console.log('第二次及以后执行主函数———————————————————————————————————— Second or Later Of Main Function');
          newDate = maxDate;
          newLines = maxLines;
          global.newLine = maxLines;
        } else if (maxDate == null) {//文件读取失败
          console.log("文件名无法适配正则表达式，文件读取失败");
        } else if (maxLines == null) {//文件为空
          console.log("文件为空");
        }

        //执行判断逻辑
        if (newDate.getTime() === lastDate.getTime() && newLines === lastLines) {
          //1.不产生新增报警数据
          // motorSpeed2Rule(10,20,maxDateFileName)
          console.log("没有新增报警数据————————————————————————————————————");
        } else if (newDate.getTime() === lastDate.getTime()) {
          //2.在同一个文件中出现新增数据，需要获取记录值，进行进一步处理
          console.log("出现新增数据，需要获取记录值，进行进一步处理————————————————————————————————————");
          motorSpeed2Rule(global.lastLine,global.newLine,maxDateFileName)
          //调用逻辑判断代码，执行完毕后，更新lastLines，lastData，global.lastLine变量@@@@@@@@@@@@@@@@@@@@@@@@@
          lastDate = maxDate;
          lastLines = maxLines;
          global.lastLine = maxLines;
        } else {
          //3.文件更新，需要重点处理
          if(1<=global.newLine){
            motorSpeed2Rule(1,global.newLine,maxDateFileName)
          }
          lastDate = maxDate;
          lastLines = maxLines;
          newDate = maxDate;
          newLines = maxLines;
          global.newLine = maxLines;
          global.lastLine = maxLines;
          console.log("文件更新，需要重点处理————————————————————————————————————");
        }
        console.log('主函数执行完毕———————————————————————————————————— End Of Main Function');
        callback();
      })
      .catch((err) => {
        console.error('Error reading file content:', err);
        callback();
      });
  });
}


// 查看全局变量
function printVariables(callback) {
  console.log('开始打印局部变量———————————————————————————————————— Begin Of Printing LocalVariables');
  console.log('newlines:', newLines);
  console.log('newDate:', newDate);
  console.log('lastLines:', lastLines);
  console.log('lastDate:', lastDate);
  console.log('打印局部变量完毕———————————————————————————————————— End Of Printing LocalVariables');
  callback();
}


// 查看全局变量
function printGlobalVariables(callback) {
  console.log('开始打印全局变量———————————————————————————————————— Begin Of Printing GloablVariables');
  console.log('global.testVar is :', global.testVar);
  console.log('global.errorMessage is :', global.errorMessage);
  console.log('global.newRecord is :', global.newRecord.time);
  console.log('global.lastRecord is :', global.lastRecord.motor_speed2);
  console.log('global.newLine is :', global.newLine);
  console.log('lobal.lastLine is :', global.lastLine);
  console.log('打印全局变量完毕———————————————————————————————————— End Of Printing GloablVariables');
  callback();
}

function printLogs(){
  const currentDate = new Date();
  console.log('Current date:', currentDate);
  console.log('*')
  console.log('*')
  console.log('*')
  global.flag=global.flag+1
  if(global.flag>3*24*6){
    global.errorMessage='已经连续3天未发生故障情况,请悉知';
    sendEmail()
    global.flag-=24*6
  }
}
function clearTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}


function yourFunction(false_max_file_date, true_max_file_date) {
  // console.log('false_max_file_date, true_max_file_date'+false_max_file_date+ true_max_file_date)
  const date1 = clearTime(false_max_file_date);
  const date2 = clearTime(true_max_file_date);
  return new Promise((resolve, reject) => {
    if (false_max_file_date && true_max_file_date) {
      if (date1 < date2) {
        global.lastBox = global.lastBoxTrue;
        global.lastTrue = global.lastTrueTmp;
        console.log('昨日不存在false文件'+global.lastBox+
          ' global.lastTrue:'+global.lastTrue+'global.lastFalse'+global.lastFalse+'global.lastWarn'+global.lastWarn);
        
      } else if (date1 > date2) {
        global.lastBox = global.lastBoxFalse;
        global.lastFalse = global.lastFalseTmp;
        global.lastWarn = global.lastWarnTmp;
        console.log('昨日不存在true文件'+global.lastBox+
          ' global.lastTrue:'+global.lastTrue+'global.lastFalse'+global.lastFalse+'global.lastWarn'+global.lastWarn);
      } else {
        global.lastBox = global.lastBoxTrue + global.lastBoxFalse;
        global.lastTrue = global.lastTrueTmp;
        global.lastFalse = global.lastFalseTmp;
        global.lastWarn = global.lastWarnTmp;
        console.log('昨日存在true与false文件global.lastBox:'+global.lastBox+
          ' global.lastTrue:'+global.lastTrue+'global.lastFalse'+global.lastFalse+'global.lastWarn'+global.lastWarn);
        
      }
      resolve();
    } else {
      console.log('有未定义的日期值，无法比较');
      reject(new Error('有未定义的日期值，无法比较'));
    }
  });
}
function updateTodayInfo(callback) {
  let false_max_file_name = null;
  let true_max_file_name = null;
  let false_max_file_date = null;
  let true_max_file_date = null;

  let max_file_date = null;

  let trueContinuousRanges =null;
  let falseContinuousRanges =null;
  let warnContinuousRanges=null;

  let completed = 0;

  function checkCompletion() {
    
    completed += 1;
    if (completed === 2) {
      yourFunction(false_max_file_date, true_max_file_date)
        .then(() => callback())
        .catch((error) => console.error(error));
    }
  }

  fs.readdir(global.truePath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    ({ fileName: true_max_file_name, date: true_max_file_date } = getMaxTrueDateFileName(files,"true"));
    console.log(true_max_file_name,true_max_file_date)
    if (!true_max_file_name) {
      console.log('updateTodayInfo-true-未找到符合条件的文件');
      callback();
      return;
    }
    readFileCalculateInfo(global.truePath,true_max_file_name)
                    .then((records) => {
                      console.log('Parsed true records:', records.length);
                      trueContinuousRanges = countContinuousRanges(records)
                      global.lastTrueTmp = trueContinuousRanges
                      const lastBox = countContinuousRangesWithWeight(records);
                      global.lastBoxTrue+=lastBox
                      console.log('True box number:', global.lastBoxTrue);
                      console.log('Number of true continuous ranges:', trueContinuousRanges);
                    })
                    .then(() => checkCompletion())
                    .catch((err) => {
                      console.error('Error processing file:', err);
                    });
  });

  fs.readdir(global.falsePath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    ({ fileName: false_max_file_name, date: false_max_file_date } = getMaxTrueDateFileName(files,"false"));
    console.log(false_max_file_name,false_max_file_date)
    if (!false_max_file_name) {
      console.log('updateTodayInfo-false-未找到符合条件的文件');
      callback();
      return;
    }
    readFileCalculateInfo(global.falsePath,false_max_file_name)
                    .then((records) => {
                      console.log('Parsed false records:', records.length);
                      falseContinuousRanges = countContinuousRanges(records)
                      global.lastFalseTmp = falseContinuousRanges
                      warnContinuousRanges=countSpecialContinuousRanges(records)
                      global.lastWarnTmp = falseContinuousRanges
                      const lastBox = countContinuousRangesWithWeight(records);
                      global.lastBoxFalse+=lastBox
                      console.log('False box number:', global.lastBoxFalse);
                      console.log('Number of warnContinuousRanges continuous ranges:', warnContinuousRanges);
                      console.log('Number of fasle continuous ranges:', falseContinuousRanges);
                    })
                    .then(() => checkCompletion())
                    .catch((err) => {
                      console.error('Error processing file:', err);
                    });
  });
}

function readFileCalculateInfo(filePath, fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath+fileName, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
        reject(err);
        return;
      }
      // 将文件内容按行分割
      const lines = data.trim().split('\n');
      // 获取标头行（第一行），并分割成各个标头
      const headers = lines[0].split(',');
      // 用于存储所有记录的数组
      const records = [];
      // 遍历除第一行外的每一行
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        const record = {};
        // 将标头作为键，列内容作为值
        headers.forEach((header, index) => {
          record[header.trim()] = row[index];
        });
        // 将生成的记录对象添加到记录数组中
        records.push(record);
      }
      // 将结果数组返回
      resolve(records);
      // console.log(records.length)
    });
    
  });
}

function countContinuousRanges(records) {
  const sortedIndices = records
    .map(record => parseInt(record.index, 10))
  let rangeCount = 0;
  let rangeBegin = null;
  let rangeEnd = null;
  // Iterate through the sorted indices
  for (let i = 0; i < sortedIndices.length; i++) {
    const currentIndex = sortedIndices[i];
    if (rangeBegin === null) {
      rangeBegin = currentIndex;
      rangeEnd = currentIndex;
    } else if (currentIndex === rangeEnd + 1) {
      rangeEnd = currentIndex;
    } else {
      if (rangeEnd - rangeBegin > 60) {
        rangeCount++;  // Count the range if the interval exceeds 60
      }
      rangeBegin = currentIndex;
      rangeEnd = currentIndex;
    }
  }
  if (rangeEnd !== null && rangeEnd - rangeBegin > 60) {
    rangeCount++;
  }
  return rangeCount;
}

function countSpecialContinuousRanges(records) {
  const sortedRecords = records
    .map(record => ({ index: parseInt(record.index, 10), speed2: record.motor_speed2 }))
  let rangeCount = 0;
  let rangeBegin = null;
  let rangeEnd = null;
  let speed2Count = 0;  // Count of Math.abs(record.speed2) < 1 within the current range
  for (let i = 0; i < sortedRecords.length; i++) {
    const record = sortedRecords[i];
    if (rangeBegin === null) {
      rangeBegin = record.index;
      rangeEnd = record.index;
      speed2Count = Math.abs(record.speed2) < 1 ? 1 : 0;
    } else if (record.index === rangeEnd + 1) {
      rangeEnd = record.index;
      if (Math.abs(record.speed2) < 1) {
        speed2Count++;
      }
    } else {
      if (speed2Count >= global.speed2Threshold && rangeEnd - rangeBegin > 60) {
        rangeCount++; 
      }
      rangeBegin = record.index;
      rangeEnd = record.index;
      speed2Count = Math.abs(record.speed2) < 1 ? 1 : 0;
    }
  }
  if (speed2Count >= global.speed2Threshold) {
    rangeCount++;
  }
  return rangeCount;
}

function countContinuousRangesWithWeight(records) {
  const sortedRecords = records
    .map(record => ({
      index: parseInt(record.index, 10),
      weight2: record.weight2
    }))
    // .sort((a, b) => a.index - b.index);  // Sort by index in ascending order
  let rangeCount = 0;
  let rangeBegin = null;
  let rangeEnd = null;
  let allWeight2GreaterThanThreshold = true;
  for (let i = 0; i < sortedRecords.length; i++) {
    const record = sortedRecords[i];
    if (rangeBegin === null) {
      rangeBegin = record.index;
      rangeEnd = record.index;
      allWeight2GreaterThanThreshold = record.weight2 > global.weight;
    } else if (record.index === rangeEnd + 1) {
      rangeEnd = record.index;
      if (record.weight2 <= global.weight) {
        allWeight2GreaterThanThreshold = false;
      }
    } else {
      // End of the current range
      if (allWeight2GreaterThanThreshold&&(rangeEnd - rangeBegin > 60)) {
        rangeCount++;  // Count the range if all weight2 values are greater than the threshold
      }
      rangeBegin = record.index;
      rangeEnd = record.index;
      allWeight2GreaterThanThreshold = record.weight2 > global.weight;
    }
  }
  if (allWeight2GreaterThanThreshold) {
    rangeCount++;
  }
  return rangeCount;
}
function executeFunctionChain() {
  executeFunction(() => {
    printVariables(() => {
      printGlobalVariables(() => {
        printLogs()
      });
    });
  });
}

//executeFunctionChain()
// 每隔一定时间间隔执行函数链
setInterval(executeFunctionChain, 10*60*1000); // 每隔十分钟执行一次


const apiUrl = global.APIURL;

function calcuteTask() {
  global.updateTime = new Date().toISOString();
  updatePastWeekInfo(()=>{
    const body = {
      type:"lastWeek",
      number: `${global.number}`,
      name: `${global.name}`,
      last7True: global.last7True,
      last7False: global.last7False,
      last7Warn: global.last7Warn,
      last7Box: global.last7Box,
      weight: global.weight,
      updateTime: global.updateTime,
      token: 'clj168168'
    };

    // 打印body对象
    console.log("last7body is: ",body);
    global.last7Box = new Array(7).fill(0);
    global.last7True = new Array(7).fill(0);
    global.last7False = new Array(7).fill(0);
    global.last7Warn = new Array(7).fill(0);
    sendPostRequest(apiUrl, '/send/update7NodeInfo', body);
  })

  // 在updateTodayInfo完成后再执行回调函数
  updateTodayInfo(() => {
    // 创建body对象
    const body = {
      number: `${global.number}`,
      name: `${global.name}`,
      lastTrue: global.lastTrue,
      lastFalse: global.lastFalse,
      lastWarn: global.lastWarn,
      lastBox: global.lastBox,
      todayTrue: global.todayTrue,
      todayFalse: global.todayFalse,
      todayWarn: global.todayWarn,
      todayBox: global.todayBox,
      weight: global.weight,
      updateTime: global.updateTime,
      token: 'clj168168'
    };

    // 打印body对象
    console.log("body is: ",body);
    global.lastBox=0;
    global.lastBoxFalse=0;
    global.lastBoxTrue=0;
    sendPostRequest(apiUrl, '/send/updateNodeInfo', body);
  });
}


calcuteTask()
//sendPostRequest(apiUrl,'/send/updateNodeInfo', body);
setInterval(calcuteTask,3* 60*1000); 
//sendPostRequest(apiUrl,'/send/queryNodeInfo', body);

function updatePastWeekInfo(callback) {
  let completed = 0;
  
  global.trueWeekInfo = [];  // 存储最近7天的 true 信息
  global.falseWeekInfo = []; // 存储最近7天的 false 信息
  
  function checkCompletion() {
    completed += 1;
    if (completed === 2) {
      processWeekInfo(global.trueWeekInfo, global.falseWeekInfo)
        .then(() => {
          printWeekInfo();
          callback();
        })
        .catch((error) => console.error(error));
    }
  }

  // 处理过去一周的数据并计算总和
  function processWeekInfo(trueInfo, falseInfo) {
    return new Promise((resolve, reject) => {
      if (trueInfo.length > 0 && falseInfo.length > 0) {
        // 初始化七个变量（数组），每个数组包含7天的数据
        global.last7Box = new Array(7).fill(0);
        global.last7True = new Array(7).fill(0);
        global.last7False = new Array(7).fill(0);
        global.last7Warn = new Array(7).fill(0);
  
        for (let i = 0; i < 7; i++) {
          const trueDate = trueInfo[i]?.date || null;
          const falseDate = falseInfo[i]?.date || null;
          const trueBox = trueInfo[i]?.box || 0;
          const falseBox = falseInfo[i]?.box || 0;
          const trueRange = trueInfo[i]?.continuousRanges || 0;
          const falseRange = falseInfo[i]?.continuousRanges || 0;
          const warnRange = falseInfo[i]?.warnContinuousRanges || 0;
  
          if (trueDate && falseDate) {
            const date1 = clearTime(falseDate);
            const date2 = clearTime(trueDate);
  
            if (date1 < date2) {
              global.last7Box[i] = trueBox;
              global.last7True[i] = trueRange;
            } else if (date1 > date2) {
              global.last7Box[i] = falseBox;
              global.last7False[i] = falseRange;
              global.last7Warn[i] = warnRange;
            } else {
              global.last7Box[i] = trueBox + falseBox;
              global.last7True[i] = trueRange;
              global.last7False[i] = falseRange;
              global.last7Warn[i] = warnRange;
            }
          } else if (trueDate) {
            global.last7Box[i] = trueBox;
            global.last7True[i] = trueRange;
          } else if (falseDate) {
            global.last7Box[i] = falseBox;
            global.last7False[i] = falseRange;
            global.last7Warn[i] = warnRange;
          } else {
            console.log('No valid file data for day:', i + 1);
          }
        }
        resolve();
      } else {
        reject(new Error('Missing data for true or false paths.'));
      }
    });
  }

  // 打印最近7天的全部信息
  function printWeekInfo() {
    console.log('---- 最近七天的信息 ----');
    for (let i = 0; i < 7; i++) {
      console.log(`Day -${i + 1}:`);
      console.log('True Info:', global.trueWeekInfo[i] || 'No true file');
      console.log('False Info:', global.falseWeekInfo[i] || 'No false file');
    }
    console.log(`Total last7Box: ${global.last7Box}`);
    console.log(`Total last7True: ${global.last7True}`);
    console.log(`Total last7False: ${global.last7False}`);
    console.log(`Total last7Warn: ${global.last7Warn}`);
    console.log('------------------------');
  }

  // 读取 true 路径的文件并存储过去7天的信息
  fs.readdir(global.truePath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    
    (async () => {
      global.true7FilesAndDates = get7TrueDateFileName(files, "true");
    
      for (let i = 0; i < 7; i++) {
        const entry = global.true7FilesAndDates[i];
    
        // 处理 entry 为 null 或缺少属性的情况
        if (entry && entry.fileName) {
          const { fileName, date } = entry;
          try {
            const records = await readFileCalculateInfo(global.truePath, fileName);
            console.log('Parsed true records for day', i + 1, ':', records.length);
            const continuousRanges = countContinuousRanges(records);
            const lastBox = countContinuousRangesWithWeight(records);
            global.trueWeekInfo.push({ date, box: lastBox, continuousRanges });
            // console.log(global.trueWeekInfo, " ** ", i);
          } catch (err) {
            console.error('Error processing file:', err);
          }
        } else {
          // 如果 entry 为 null 或 fileName 不存在，添加 null
          global.trueWeekInfo.push(null);
          // console.log(global.trueWeekInfo, " ** ", i);
        }
    
        // 在最后一次迭代时调用 checkCompletion
        if (i === 6) checkCompletion();
      }
    })();
  });

  // 读取 false 路径的文件并存储过去7天的信息
  fs.readdir(global.falsePath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    (async () => {
      global.false7FilesAndDates = get7TrueDateFileName(files, "false");
      console.log(global.false7FilesAndDates);

      for (let i = 0; i < 7; i++) {
        const { fileName, date } = global.false7FilesAndDates[i];
        if (fileName) {
          readFileCalculateInfo(global.falsePath, fileName)
            .then((records) => {
              console.log('Parsed false records for day', i + 1, ':', records.length);
              const continuousRanges = countContinuousRanges(records);
              const warnContinuousRanges = countSpecialContinuousRanges(records);
              const lastBox = countContinuousRangesWithWeight(records);
              global.falseWeekInfo.push({ date, box: lastBox, continuousRanges, warnContinuousRanges });
            })
            .then(() => {
              if (i === 6) checkCompletion();
            })
            .catch((err) => {
              console.error('Error processing file:', err);
            });
        } else {
          global.falseWeekInfo.push(null);
        }
        if (i === 6) checkCompletion();
        
      }
    })();
  });
}

