const cors = require("cors");
const fileUpload = require("express-fileupload");

const express = require("express");
const expressApp = express();
const testData = require("./testdata");
expressApp.use(cors());
expressApp.use(fileUpload());

expressApp.listen("3033", () => {
  console.log("app is running on port 3033");
});

expressApp.get("/", (req, res, next) => {
  testData.testDataValue();
  res.json({ status: "app is up and running" });
});

expressApp.get("/test", (req, res, next) => {
  res.json({ name: "atul", data: "kuch bhi" });
});

expressApp.post("/uploadFile", (req, res, next) => {
  if (!req.files || !Object.keys(req.files)) {
    res.status(400).send("No file uploaded");
  } else {
    console.log(process.cwd());
    const inputDir = process.cwd() + "/inputfiles";
    console.log(inputDir);
    const uploadedFile = req.files.fileInfo;
    uploadedFile.mv(`${inputDir}/${uploadedFile.name}`, (error) => {
      if (error) {
        console.log(error);

        return res.status(500).send(error);
      } else {
        console.log("uploaded ");
        res.send("File uploaded");
      }
    });
  }

  // uploadedFile.mv("", (error) => {
  //   res.send("File uploaded");
  // });
});
