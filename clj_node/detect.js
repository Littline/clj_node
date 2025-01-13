const fs = require('fs');
require('./globalVars');  // 引入并赋值给 local variable

const motorSpeed2Rule = require('./alarmRules');
const sendEmail = require('./sendmail');
const path1 = global.path;
let lastDate=null;
let lastLines=null;
let newDate=null;
let newLines=null;
const http = require('http');

function sendPostRequest(url,path1, body) {
    const data = JSON.stringify(body);
    const options = {
        hostname: url,
        port: 8081, 
        path: path1,
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
  maxDate.setDate(maxDate.getDate())

  // 从最大日期开始，获取前1到global.daysNumber天的文件名称及日期
  let results = [];
  for (let i = 1; i <= global.daysNumber; i++) {
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
    fs.readFile(path1 + fileName, 'utf8', (err, data) => {
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
  fs.readdir(path1, (err, files) => {
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
//正常的运行次数
function countContinuousRanges(records) {
  if (records.length === 0) return 0;
  let count = 0;  // 统计满足条件的区间个数
  let start = 0;  // 记录当前区间的起始索引
  for (let i = 1; i < records.length; i++) {
      // 将 index 转换为整数（这里使用四舍五入）
      const currentIndex = Math.round(records[i].index);
      const previousIndex = Math.round(records[i - 1].index);
      // 如果当前记录的 index 与前一条记录的 index 不连续
      if (currentIndex !== previousIndex + 1) {
          if (i - start > 60) {  // 判断区间长度是否大于60
              count++;
          }
          start = i;  // 更新新的区间起点
      }
  }
  if (records.length - start > 60) {
      count++;
  }
  return count;
}

//异常的运行次数，也即报警
function countContinuousRangesWarning(records) {
  if (records.length === 0) return 0;
  let count = 0;  // 统计满足条件的区间个数
  let start = 0;  // 记录当前区间的起始索引
  for (let i = 1; i < records.length; i++) {
    if(Math.round(records[i].event_type)===1)continue;
    const currentIndex = Math.round(records[i].index);
    const previousIndex = Math.round(records[i - 1].index);

    // if (currentIndex !== previousIndex + 1 && Math.round(records[i].event_num)!==Math.round(records[i-1].event_num)) {
    if (currentIndex !== previousIndex + 1 ) {
        if (i - start > 60) {  // 判断区间长度是否大于60
            // console.log("i - start",i - start);
            count++;
        }
        start = i;  // 更新新的区间起点
    }
  }
  // 最后一个区间也需要检查
  if (records.length - start > 60) {
    // console.log("i - start",count);
      count++;
  }
  return count;
}


  //故障（仿照运行次数进行计算
function countSpecialContinuousRanges(records) {
  if (records.length === 0) return 0;
  let count = 0;  // 统计满足条件的区间个数
  let start = 0;  // 记录当前区间的起始索引
  let temsum=global.weight + global.emptySpinnerWeight;
  temsum=0;
  for (let i = 1; i < records.length; i++) {
    if (Math.round(records[i].event_type) === 1) continue;
    const currentIndex = Math.round(records[i].index);
    const previousIndex = Math.round(records[i - 1].index);
  // if (currentIndex !== previousIndex + 1 && Math.round(records[i].event_num)!==Math.round(records[i-1].event_num)) {
    if (currentIndex !== previousIndex + 1 ) {
      if (i - start > 60) {  // 判断区间长度是否大于60
        //根据前60条记录计算重量
        const rangeWeights = records.slice(start, start+60).map(record => parseFloat(record.weight2.trim()));
        rangeWeights.sort((a, b) => a - b);
        const trimmedWeights = rangeWeights.slice(20, rangeWeights.length - 20);
        const averageWeight2 = trimmedWeights.reduce((sum, weight) => sum + weight, 0) / trimmedWeights.length;
        //根据全部记录计算速度
        const rangeSpeed2s = records.slice(start, i).map(record => parseFloat(record.motor_speed2.trim()));
        const speed2Count=rangeSpeed2s.filter(speed2 => Math.abs(speed2) < 1).length;
        
        if (averageWeight2 >temsum) {
          if (speed2Count>=global.speed2Threshold) {
            console.log("rangeWeights.length",rangeWeights.length,"rangeSpeed2s.length",rangeSpeed2s.length,"rangeSpeed2s",rangeSpeed2s)
            count++;
          }
        }
        
      }
      start = i;  // 更新新的区间起点
    }
  }
  
  // 最后一个区间也需要检查
  if (records.length - start > 60) {
    const rangeWeights = records.slice(start,start, start+60).map(record => parseFloat(record.weight2.trim()));
    rangeWeights.sort((a, b) => a - b);
    const trimmedWeights = rangeWeights.slice(20, rangeWeights.length - 20);

    const rangeSpeed2s = records.slice(start).map(record => parseFloat(record.motor_speed2.trim()));
    const speed2Count=rangeSpeed2s.filter(speed2 => Math.abs(speed2) < 1).length;
    if (trimmedWeights.length > 0) {
      const averageWeight2 = trimmedWeights.reduce((sum, weight) => sum + weight, 0) / trimmedWeights.length;
      
      if (averageWeight2 >temsum&&speed2Count>global.speed2Threshold) {
          count++;
      }
    }
  }
  
  return count;
}

//箱量
function countContinuousRangesWithWeight(records) {
  if (records.length === 0) return 0;
  let count = 0;  // 统计满足条件的区间个数
  let start = 0;  // 记录当前区间的起始索引
  let lastState = false;  // 记录上一个有效状态
  let temsum=global.weight + global.emptySpinnerWeight
  for (let i = 1; i < records.length; i++) {
    if (Math.round(records[i].event_type) === 1) continue;
    const currentIndex = Math.round(records[i].index);
    const previousIndex = Math.round(records[i - 1].index);
    if (currentIndex !== previousIndex + 1 && Math.round(records[i].event_num) !== Math.round(records[i - 1].event_num)) {
      if (i - start > 60) {  // 判断区间长度是否大于60
        const rangeWeights = records.slice(start, i).map(record => parseFloat(record.weight2.trim()));
        rangeWeights.sort((a, b) => a - b);
        const trimmedWeights = rangeWeights.slice(20, rangeWeights.length - 20);
        // console.log("rangeWeights",rangeWeights.length)
        const averageWeight2 = trimmedWeights.reduce((sum, weight) => sum + weight, 0) / trimmedWeights.length;
        
        if (averageWeight2 >temsum) {
          // 只有当状态变化时才增加计数
          if (!lastState) {
            count++;
            lastState = true;  // 更新状态，表示已增加过计数
          }
        } else {
          lastState = false;  // 如果不满足条件，重置状态
        }
        
      }
      start = i;  // 更新新的区间起点
    }
  }
  
  // 最后一个区间也需要检查
  if (records.length - start > 60) {
    const rangeWeights = records.slice(start).map(record => parseFloat(record.weight2.trim()));
    rangeWeights.sort((a, b) => a - b);
    const trimmedWeights = rangeWeights.slice(20, rangeWeights.length - 20);
    
    if (trimmedWeights.length > 0) {
      const averageWeight2 = trimmedWeights.reduce((sum, weight) => sum + weight, 0) / trimmedWeights.length;
      
      if (averageWeight2 >temsum&&!lastState) {
          count++;
      }
    }
  }
  
  return count;
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
setInterval(executeFunctionChain, 60*60*1000); // 每隔60分钟执行一次


const apiUrl = global.APIURL;

function calcuteTask() {
  global.updateTime = new Date(+new Date()+8*3600*1000).toISOString();
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
    global.last7Box = new Array(global.daysNumber).fill(0);
    global.last7True = new Array(global.daysNumber).fill(0);
    global.last7False = new Array(global.daysNumber).fill(0);
    global.last7Warn = new Array(global.daysNumber).fill(0);
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
setInterval(calcuteTask,60* 60*1000); 
//sendPostRequest(apiUrl,'/send/queryNodeInfo', body);

function updatePastWeekInfo(callback) {
  let completed = 0;
  
  global.trueWeekInfo = [];  // 存储最近global.daysNumber天的 true 信息
  global.falseWeekInfo = []; // 存储最近global.daysNumber天的 false 信息
  
  function checkCompletion() {
    completed += 1;
    // console.log('global.falseWeekInfo',global.falseWeekInfo)
    // console.log("completed is: ",completed)
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
      console.log("true info is: ",trueInfo,"length is:",trueInfo.length)
      console.log("false info is: ",falseInfo,"length is:",falseInfo.length)
      if (trueInfo.length > 0 && falseInfo.length > 0) {
        // 初始化4个变量（数组），每个数组包含global.daysNumber天的数据
        global.last7Box = new Array(global.daysNumber).fill(0);
        global.last7True = new Array(global.daysNumber).fill(0);
        global.last7False = new Array(global.daysNumber).fill(0);
        global.last7Warn = new Array(global.daysNumber).fill(0);
  
        for (let i = 0; i < global.daysNumber; i++) {
          const trueDate = trueInfo[i]?.date || null;
          const falseDate = falseInfo[i]?.date || null;
          const trueBox = trueInfo[i]?.box || 0;
          const falseBox = falseInfo[i]?.box || 0;
          const trueRange = trueInfo[i]?.continuousRanges || 0;
          const falseRange = falseInfo[i]?.continuousRanges || 0;
          const warnRange = falseInfo[i]?.warnContinuousRanges || 0;
  
          if (trueDate && falseDate) {
              global.last7Box[i] = trueBox + falseBox;
              global.last7True[i] = trueRange+falseRange;
              global.last7False[i] = falseRange;
              global.last7Warn[i] = warnRange;
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
          // console.log("the ", i + 1," finally result global.last7Box[i] is:",global.last7Box[i],"global.last7True[i] is: ",global.last7True[i],"global.last7False[i] is: ",global.last7False[i]," global.last7Warn[i] is: ", global.last7Warn[i]);
        }
        resolve();
      } else {
        reject(new Error('Missing data for true or false paths.'));
      }
    });
  }

  // 打印最近7天的全部信息
  function printWeekInfo() {
    console.log('---- 最近',global.daysNumber,'天的信息 ----');
    for (let i = 0; i < global.daysNumber; i++) {
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

  // 读取 true 路径的文件并存储过去global.daysNumber天的信息
  fs.readdir(global.truePath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    (async () => {
      global.true7FilesAndDates = get7TrueDateFileName(files, "true");
      for (let i = 0; i < global.daysNumber; i++) {
        const entry = global.true7FilesAndDates[i];
        if (entry && entry.fileName) {// 处理 entry 为 null 或缺少属性的情况
          const { fileName, date } = entry;
          try {
            const records = await readFileCalculateInfo(global.truePath, fileName);
            console.log('Parsed true records for day', i + 1, ':', records.length,'filename is:',fileName);
            const continuousRanges = countContinuousRanges(records);
            const lastBox = countContinuousRangesWithWeight(records);
            global.trueWeekInfo.push({ date, box: lastBox, continuousRanges });
            // console.log(global.trueWeekInfo, " ** ", i);
          } catch (err) {
            console.error('Error processing file:', err);
          }
        } else {
          global.trueWeekInfo.push(null);
          // console.log(global.trueWeekInfo, " ** ", i);
        }
        // 在最后一次迭代时调用 checkCompletion
        if (i === global.daysNumber-1) checkCompletion();
      }
    })();
  });
  // 读取 false 路径的文件并存储过去global.daysNumber天的信息
  fs.readdir(global.falsePath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    (async () => {
      global.false7FilesAndDates = get7TrueDateFileName(files, "false");
      // console.log('global.false7FilesAndDates',global.false7FilesAndDates);
      for (let i = 0; i < global.daysNumber; i++) {
        const entry = global.false7FilesAndDates[i];
        if (entry && entry.fileName) {
          const { fileName, date } = entry;
          try {
            const records = await readFileCalculateInfo(global.falsePath, fileName);
            console.log('Parsed false records for day', i + 1, ':', records.length,'filename is:',fileName);
            const continuousRanges = countContinuousRangesWarning(records);
            const warnContinuousRanges = countSpecialContinuousRanges(records);
            const lastBox = countContinuousRangesWithWeight(records);
            global.falseWeekInfo.push({ date, box: lastBox, continuousRanges, warnContinuousRanges });
          } catch (err) {
            console.error('Error processing file:', err);
          }
        } else {
          global.falseWeekInfo.push(null);
        }
        if (i === global.daysNumber-1) checkCompletion();
        
      }
    })();
  });
}
const path = require('path');
const parentDir = path.resolve(global.path, '..');
const STATE_FILE = path.join(parentDir, 'processing_state.json');
console.log('STATE_FILE  ', STATE_FILE);
console.log('上一级目录:', parentDir);
const allFileNames = getAllFileNames(global.falsePath);

function getAllFileNames(directoryPath) {
  try {
    // 读取目录下的所有文件和子目录
    const files = fs.readdirSync(directoryPath);
    
    // 过滤出文件（排除子目录）
    const fileNames = files.filter(file => {
      const filePath = path.join(directoryPath, file);
      return fs.statSync(filePath).isFile();
    });

    return fileNames;
  } catch (err) {
    console.error('读取目录时出错:', err);
    return [];
  }
}

// function getFilesToProcess() {
//   const state = readState();
//   const allFiles = getAllFileNames(global.falsePath);
//   console.log('全部文件:', allFiles);

//   let filesToProcess = allFiles.filter(file => !state.processedFiles.includes(file));

//   return filesToProcess;
// }
function getFilesToProcess() {
  const state = readState();
  const allFiles = getAllFileNames(global.falsePath);
  console.log('全部文件:', allFiles);

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需要加1
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  console.log('今日日期:', todayStr);

  // 过滤掉已处理的文件和包含今日日期的文件
  let filesToProcess = allFiles.filter(file => {
    const isProcessed = state.processedFiles.includes(file);
    const isToday = file.includes(todayStr);
    return !isProcessed && !isToday;
  });

  console.log('需要处理的文件:', filesToProcess);
  return filesToProcess;
}

function readState() {
  if (fs.existsSync(STATE_FILE)) {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    try {
      const parsedData = JSON.parse(data);
      return {
        processedFiles: parsedData.processedFiles || []
      };
    } catch (err) {
      console.error('状态文件解析错误:', err);
      return {
        processedFiles: []
      };
    }
  } else {
    // 初始化状态
    return {
      processedFiles: []
    };
  }
}

// append写入状态文件
function writeState(newProcessedFiles) {
  // 确保目录存在
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 读取现有状态
  const state = readState();

  // 使用 Set 确保唯一性，防止重复添加
  const updatedProcessedFiles = Array.from(new Set([...state.processedFiles, ...newProcessedFiles]));

  const stateToWrite = {
    processedFiles: updatedProcessedFiles
  };

  // 写入状态文件
  fs.writeFileSync(STATE_FILE, JSON.stringify(stateToWrite, null, 2), 'utf-8'); // 使用缩进2更易读
}
function formatTime(timeString) {
  const date = new Date(timeString);
  if (isNaN(date.getTime())) {
      console.error(`Invalid time string: ${timeString}`);
      return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
async function sendWarningData(intervalRecords, fileName) {
  // 确保 intervalRecords 中有数据
  if (intervalRecords.length === 0) {
    console.warn(`文件 ${fileName} 的区间记录为空，跳过发送。`);
    return;
  }

  // 仅处理当前区间内的数据
  const motor_speed2 = intervalRecords.map(record => parseFloat(record.motor_speed2.trim()));
  const weight2 = intervalRecords.map(record => parseFloat(record.weight2.trim()));
  const rawTime = intervalRecords[0].time; // e.g., "2024-11-04 00:00:03.620604"
  const formattedTime = formatTime(rawTime);
  const length = weight2.length;
  console.log('time is: ',formattedTime)

  const body = {
    number: `${global.number}`,
    name: `${global.name}`,
    motor_speed2: motor_speed2, // 确保字段名与API一致
    weight2: weight2,
    time: formattedTime, // "yyyy-MM-dd HH:mm"
    length: length,
    token: 'clj168168'
  };

  try {
    const response = await sendPostRequest1(apiUrl, '/send/insertHistoryRecord', body);
    console.log('报警数据发送成功:', response);

    // 解析响应并检查 success 字段
    const responseJson = JSON.parse(response);
    if (!responseJson.success) {
      console.error(`报警数据发送失败: ${responseJson.errorMsg}`);
      throw new Error(`报警数据发送失败: ${responseJson.errorMsg}`);
    }
  } catch (err) {
    console.error('发送报警数据失败:', err);
    // 可根据需要添加重试逻辑或报警机制
    throw err; // 重新抛出错误以便外层捕获
  }
}
async function sendPostRequest1(url, path, body) {
  const data = JSON.stringify(body);

  const options = {
    hostname: url,
    port: 8081, // 如果使用HTTPS，则为443
    path: path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let responseData = '';
      res.on('data', chunk => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve(responseData);
      });
    });
    req.on('error', error => {
      reject(error);
    });
    req.write(data);
    req.end();
  });
}
// 统计并发送满足条件的报警区间
async function countAndSendContinuousRangesWarning(records, fileName) {
  if (records.length === 0) return 0;

  let count = 0; // 统计满足条件的区间个数
  let start = 0; // 记录当前区间的起始索引

  // 收集所有发送报警数据的 Promise
  const sendPromises = [];

  for (let i = 1; i < records.length; i++) {
    // 跳过 event_type 为 1 的记录
    if (Math.round(records[i].event_type) === 1) continue;

    const currentIndex = Math.round(records[i].index);
    const previousIndex = Math.round(records[i - 1].index);

    if (currentIndex !== previousIndex + 1) {
      // 检查当前区间长度是否大于60
      if (i - start > 60) {
        const intervalRecords = records.slice(start, i);
        // 发送报警数据并收集 Promise
        const sendPromise = sendWarningData(intervalRecords, fileName)
          .then(() => {
            count++;
          })
          .catch(err => {
            console.error(`发送报警数据失败，文件: ${fileName}, 区间: ${start}-${i - 1}`, err);
            // 根据需要，可以选择不抛出错误以继续处理其他区间
          });
        sendPromises.push(sendPromise);
      }
      start = i; // 更新新的区间起点
    }
  }

  // 检查最后一个区间
  if (records.length - start > 60) {
    const intervalRecords = records.slice(start, records.length);
    const sendPromise = sendWarningData(intervalRecords, fileName)
      .then(() => {
        count++;
      })
      .catch(err => {
        console.error(`发送报警数据失败，文件: ${fileName}, 区间: ${start}-${records.length - 1}`, err);
        // 根据需要，可以选择不抛出错误以继续处理其他区间
      });
    sendPromises.push(sendPromise);
  }

  // 等待所有报警数据发送完成
  await Promise.all(sendPromises);

  return count;
}

// 处理单个文件
async function processFile(fileName) {
  try {
    const records = await readFileCalculateInfo(global.falsePath, fileName);
    console.log('Parsed records:', records.length);

    // 统计并发送报警区间
    const sentCount = await countAndSendContinuousRangesWarning(records, fileName);
    console.log(`文件 ${fileName} 处理完成，发送了 ${sentCount} 个报警区间。`);

    if (sentCount > 0) {
      // 如果有发送成功的报警区间，标记文件为已处理
      writeState([fileName]);
      console.log(`文件 ${fileName} 已标记为已处理。`);
    } else {
      console.log(`文件 ${fileName} 中没有需要发送的报警区间。`);
    }

  } catch (err) {
    console.error(`Error processing file ${fileName}:`, err);
    // 可根据需要添加错误处理逻辑，例如重试机制
  }
}

// 发送历史数据的函数
async function sendHistoricalData() {
  const filesToProcessList = getFilesToProcess();
  console.log('待处理的文件列表:', filesToProcessList);

  for (const fileName of filesToProcessList) {
    console.log(`开始处理文件: ${fileName}`);
    await processFile(fileName);
    console.log(`完成处理文件: ${fileName}`);
  }

  console.log('所有待处理文件已完成处理。');
}

sendHistoricalData()
  .then(result => {
    console.log('历史数据发送成功:', result);
  })
  .catch(err => {
    console.error('发送历史数据任务失败:', err);
  });

// 设置每天发送两次（每 12 小时）
const twelveHoursInMilliseconds = 12 * 60 * 60 * 1000;

setInterval(() => {
  sendHistoricalData()
    .then(result => {
      console.log('定时任务：历史数据发送成功:', result);
    })
    .catch(err => {
      console.error('定时任务：发送历史数据失败:', err);
    });
}, twelveHoursInMilliseconds);