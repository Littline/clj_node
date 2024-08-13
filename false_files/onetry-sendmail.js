// sendmail.js
const nodemailer = require('nodemailer');
require('./globalVars');
function sendEmail() {
    let transporter = nodemailer.createTransport({
        service: 'qq',
        port: 465,
        secure: false, 
        auth: {
          user: "1244911132@qq.com", 
          pass: "sohnxbshvqkyijdg",
        },
      });

    let mailOptions = {
        from: '1244911132@qq.com',
        to: 'sujiuzheng@gmail.com',
        cc: 'nian.wu@whu.edu.cn',
        // cc: ['nian.wu@whu.edu.cn', 'third@example.com'],
        subject: 'Warning Email',
        text: global.errorMessage
    };

    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log('***********Email sent: ' + info.response+'***********');
        }
    });

    //回调
    console.log('Global variable value:', global.testVar);
    console.log('global.errorMessage is ',global.errorMessage);
}

module.exports = sendEmail;