const fs = require('fs');
require('./globalVars');
const motorSpeed2Rule = require('./alarmRules');
const sendEmail = require('./sendmail');
const path = global.path;
let lastDate=null;
let lastLines=null;
let newDate=null;
let newLines=null;
// 1.获取日期最大的文件名称
// input:
function getMaxDateFileName(files) {
  let maxDateFileName = null;
  let maxDate = null;
  files.forEach((file) => {
    const match = file.match(/detection_data_([0-9]{4}-[0-9]{2}-[0-9]{2})_false_normal\.csv/);
    // console.log('匹配结果:', match);
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
  if(global.flag>1*24*6){
    global.errorMessage='已经连续1天未发生故障情况，请悉知';
    sendEmail()
  }
}





function executeFunctionChain() {
  executeFunction(() => {
    printVariables(() => {
      printGlobalVariables(() => {
        // 所有函数执行完毕
        printLogs()
      });
    });
  });
}

executeFunctionChain()
// 每隔一定时间间隔执行函数链
setInterval(executeFunctionChain, 10*60*1000); // 每隔十分钟执行一次
//setInterval(executeFunctionChain, 30*1000);// 每隔30秒执行一次

// setInterval(executeFunction, 3*1000);




// 调用 sendEmail 函数
// const sendEmail = require('./sendmail');
// sendEmail();