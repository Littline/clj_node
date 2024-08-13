const nodemailer = require('nodemailer');  
const { errorMessage, testVar } = require('./globalVars'); // 假设你的globalVars模块导出了这些变量  
  
async function sendEmailWithRetry(mailOptions, maxRetries = 3, retryDelay = 30000, currentRetry = 0) {  
    // 封装transporter.sendMail为返回Promise的函数  
    console.log('***********currentRetry is: ' + currentRetry + '***********');  
    return new Promise((resolve, reject) => {  
        let transporter = nodemailer.createTransport({  
            // service: 'smtp.163.com',  
            host: 'smtp.163.com',
            port: 465,  
            secure: true,   
            auth: {  
                user: "jiuzheng_su@163.com",   
                pass: "ZNGSDOCERJEEUDII",  
            },  
        });  
  
        transporter.sendMail(mailOptions, (error, info) => {  
            if (error) {  
                if (currentRetry < maxRetries) {  
                    // 重试前等待一段时间  
                    setTimeout(() => {  
                        sendEmailWithRetry(mailOptions, maxRetries, retryDelay, currentRetry + 1)  
                            .then(resolve) // 如果成功，解决Promise  
                            .catch(reject); // 如果失败且达到最大重试次数，拒绝Promise  
                    }, retryDelay);  
                } else {  
                    // 如果达到最大重试次数，则拒绝Promise  
                    reject(error);  
                }  
            } else {  
                // 如果发送成功，解决Promise  
                resolve(info);  
            }  
        });  
    });  
}  
  
function sendEmail() {  
    let mailOptions = {  
        from: 'jiuzheng_su@163.com',  
        to: 'sujiuzheng@gmail.com',  
        cc: 'nian.wu@whu.edu.cn',  
        subject: 'Warning--Email'+global.place,  
        text: global.errorMessage,
        html: global.errorMessage 
    };  
  
    sendEmailWithRetry(mailOptions)  
        .then(info => {  
            console.log('***********Email sent: ' + info.response + '***********');
            global.flag=0//清空  
        })  
        .catch(error => {  
            console.error('发送邮件时发生错误:', error);  
        })  
        .finally(() => {  
            // 无论成功还是失败，都会执行的回调  
            console.log('Global variable value:', global.testVar);  
            console.log('global.errorMessage is ', global.errorMessage);  
        });  
}  
  
module.exports = sendEmail;