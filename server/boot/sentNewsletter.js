"use strict";

const formidable = require("formidable");
const fs = require("fs");
const csvParser = require("csv-parser");
const moment = require("moment");
const Bull = require("bull");
const nodemailer = require("nodemailer");

const emailQueue = new Bull("newsletter-queue", {
  redis: "redis:6379",
});

const parkingLotQueue = new Bull("parking-lot-queue", {
  redis: "redis:6379",
});

module.exports = (server) => {
  const user = server.models.user;
  const logs = server.models.logs;

  server.post("/newsLetter", (req, res) => {
    try {
      const csvFile = formidable({ multiples: true });
      csvFile.parse(req, (err, fields, files) => {
        if (!files.csv_file || !files.csv_file.path) {
          throw { message: "Failed to upload csv" };
        }
        let csvContent = [];
        fs.createReadStream(files.csv_file.path)
          .pipe(csvParser())
          .on("data", (data) => {
            csvContent.push(data);
          })
          .on("end", async () => {
            let emailArray = csvContent.map((csv) => csv.email);

            let emailContent = await new Promise((resolve, reject) => {
              user.find(
                {
                  where: { email: { inq: emailArray } },
                },
                (findUserError, findUserResponse) => {
                  if (findUserError)
                    reject({
                      error: findUserError,
                      message: "Failed to fetch user details",
                    });
                  let updateCSV = [];
                  csvContent.forEach((content) => {
                    findUserResponse.forEach((response) => {
                      if (content.email == response.email) {
                        let newFeed = content;
                        newFeed.firstname = response.firstname;
                        newFeed.lastname = response.lastname;
                        updateCSV.push(newFeed);
                      }
                    });
                  });
                  resolve(updateCSV);
                }
              );
            });
            for await (const email of emailContent) {
              let htmlContent =
                '<!DOCTYPE html><html><body style=" color: #444; margin: auto; border: 30px solid #ebebeb; max-width: 800px; padding: 1.5em 2em; "><table style=" font-family: Arial, Helvetica Neue, Helvetica, sans-serif; width: 100%; "><tbody><tr style=" width: 100%; margin-bottom: 1em; "><td style="border-bottom: 4px solid #a8a8e4;"><h2 padding-left: 300px;">' +
                email.name +
                '</h2></td></tr><tr><td><h3 style="margin-top: 40px; margin-bottom: 50px; color: #5f5f5f; text-align: center"> <strong></strong></h3><p>Hi ' +
                email.firstname +
                " " +
                email.lastname +
                ",</p><p>" +
                email.content +
                '<br /><br /><br /><p style="margin-top: 3em"></p></td></tr></tbody></table></body></html>';
              let emailBody = {
                to: email.email,
                from: "no-reply-newsletter123@protonmail.com",
                subject: "Newsletter",
                name: email.name,
                html: htmlContent,
              };
              emailQueue.add(emailBody);
            }
            let emailSentStatus = [];
            emailQueue.process((job) => {
              return sendMail(job.data);
            });
            emailQueue.on("completed", async (completedJob) => {
              await emailSentStatus.push(completedJob.returnvalue);
              await logs.create(
                {
                  email: completedJob.returnvalue.recipient,
                  newsLetterName: completedJob.returnvalue.newsLetterName,
                  date: moment().toDate(),
                },
                (createLogError, createLogResponse) => {
                  if (createLogError)
                    throw {
                      message: "Failed to log the sent mail status",
                      error: createLogError,
                    };
                }
              );
              if (emailSentStatus.length == emailContent.length) {
                res.status(200).send({
                  status: "success",
                  data: emailSentStatus,
                  message: "Newsletters sent successfully",
                });
              }
            });
            emailQueue.on("failed", (job, err) => {
              console.log("Error: ", job.data.description);
              parkingLotQueue.add(job.data);
            });
          });
      });
    } catch (err) {
      res.status(400).send({
        status: "error",
        error: err.error || err,
        message: err.message || "Failed to send news letter",
      });
    }
  });
};

function sendMail(data) {
  return new Promise(async (resolve, reject) => {
    let mailOptions = data;
    let testAccount = await nodemailer.createTestAccount();
    let mailConfig = {
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    };
    nodemailer
      .createTransport(mailConfig)
      .sendMail(mailOptions, (err, info) => {
        const response = {
          recipient: mailOptions.to,
          newsLetterName: mailOptions.name,
          sampleMailUrl: nodemailer.getTestMessageUrl(info),
        };
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
  });
}
