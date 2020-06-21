const {
  startMigration,
  processMessage,
  allMessage,
} = require("./bookdata_migration_dev");
const cors = require("cors");
const fileUpload = require("express-fileupload");

const express = require("express");
const expressApp = express();
const whitelist = ["http://localhost:3000", "http://localhost:3021"];
const corsOptions = {
  credentials: true, // This is important.
  origin: (origin, callback) => {
    if (whitelist.includes(origin)) return callback(null, true);

    callback(new Error("Not allowed by CORS"));
  },
};
expressApp.use(cors(corsOptions));
expressApp.use(fileUpload());
expressApp.use(express.static(__dirname + "/node_modules"));
const expressServer = expressApp.listen("3033", () => {
  console.log("app is running on port 3033");
});

const io = require("socket.io").listen(expressServer);

expressApp.get("/", (req, res, next) => {
  res.json({ status: "app is up and running" });
});

expressApp.get("/test", (req, res, next) => {
  bookdata_migration_dev.testDataValue();
  res.json({ name: "atul", data: "kuch bhi" });
});

expressApp.get("/startmigration", (req, res, next) => {
  console.log("start mig");
  startMigration();
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
        res.send("File uploaded");
      }
    });
  }
});

io.on("connection", (client) => {
  let i = 0;
  console.log("client connected in  migration");
  client.on("join", (data) => {
    console.log("data value " + data);

    // if (allMessage.length > 0) {
    //   client.emit("fromServer", "dddd");
    // }

    var interval = setInterval(() => {
      console.log(allMessage);

      while (allMessage.length > 0) {
        client.emit("fromServer", allMessage.shift());
      }

      if (allMessage.length > 0) {
        console.log("all data ");
        console.log(allMessage);
        while (allMessage.length > 0) {
          client.emit("fromServer", allMessage.shift());
        }
        // client.emit("fromServer", allMessage.shift());
      }
    }, 1000);

    setTimeout(() => {
      console.log("clear called ");
      clearInterval(interval);
    }, 60 * 1000);
  });
});
