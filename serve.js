const testData = require("./testdata");
const express = require("express");
const expressApp = express();

expressApp.listen("3033", () => {
  console.log("app is running on port 3033");
});

expressApp.get("/", (req, res, next) => {
  testData.testDataValue();
  testData.addData(5, 6);
  res.json({ status: "app is up and running" });
});

expressApp.get("/test", (req, res, next) => {
  res.json({ name: "atul", data: "kuch bhi" });
});
