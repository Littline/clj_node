require('./globalVars');
const fs = require('fs');
const sendEmail = require('./sendmail');

function motorSpeed2RuleTmp(lastLine,newLine,fileName) {
    console.log('开始执行报警规则———————————————————————————————————— Begin of Print motorSpeed2Rule');
    

    //打印
    console.log('lastLine value is', lastLine);
    console.log('newLine value is ',newLine);
    console.log('fileName value is', fileName);
    console.log('结束执行报警规则———————————————————————————————————— End of Print motorSpeed2Rule');
}





function motorSpeed2Rule(lastLine, newLine, fileName) {
    const path = global.path + fileName; 
    fs.readFile(path, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }
        console.log('开始执行报警规则———————————————————————————————————— Begin of Print motorSpeed2Rule');
        const lines = data.trim().split('\n'); // 将文件内容按行拆分为数组
        const motorSpeed2Values = [];
        const headers = lines[0].split(',');

        // 查找 'power12' 列的索引
        const power12Index = headers.indexOf('motor_speed2');
        if (power12Index === -1) {
            console.error('Column "motor_speed2" not found in headers.');
            return;
        }

        for (let i = lastLine; i <= newLine && i < lines.length; i++) {
            const columns = lines[i].split(','); // 将每一行按逗号拆分为数组
            const power12Value = columns[power12Index]; // 获取 'power12' 列的值
            motorSpeed2Values.push(power12Value); // 将 'power12' 列的值存入数组
        }
        const negativeOrZeroCount = countNegativeOrZeroValues(motorSpeed2Values);
        if(negativeOrZeroCount>=200){
            const currentDate = new Date();
            global.errorMessage='在'+currentDate+'附近发生预报警，'+'原因为新增疑似报警数据中motor_speed2属性超过数200个绝对值小于1';
            console.log('——————————————————warning——————————————————'+'waring——————————————————warning——————————————————');
            sendEmail();
        }
        console.log('motorSpeed2Values values:', motorSpeed2Values);
        console.log('negativeOrZeroCount values:', negativeOrZeroCount);
        console.log('结束执行报警规则———————————————————————————————————— End of Print motorSpeed2Rule');
    });
}

function countNegativeOrZeroValues(arr) {
    let count = 0;
    arr.forEach(value => {
        if (value <= 1 && value >=-1) {
            count++;
        }
    });
    return count;
}

module.exports = motorSpeed2Rule;