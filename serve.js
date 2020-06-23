const {
  startMigration,
  processMessage,
  allMessage,
} = require("./bookdata_migration_dev");

const { deletCS } = require("./deletecs");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");

const express = require("express");
const expressApp = express();
const whitelist = ["http://localhost:3000", "http://localhost:3021"];

const DEELETE_CS_DIR = process.cwd() + "/delete_cs_input_files";
const corsOptions = {
  credentials: true, // This is important.
  origin: (origin, callback) => {
    if (whitelist.includes(origin)) return callback(null, true);

    callback(new Error("Not allowed by CORS"));
  },
};

expressApp.use(bodyParser.json());
// expressApp.use(cors(corsOptions));
expressApp.use(cors());
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
  console.log("starting migration");
  startMigration()
    .then((migResponse) => {
      return res.json({ fileName: migResponse });
    })
    .catch((error) => {
      return res.status(500).send(error);
    });
});

expressApp.post("/downloadFile", (req, res, next) => {
  let filepath = req.body.data.fileName;
  console.log(req.body.data.fileName);
  const ff =
    "/Users/mmt8210/Desktop/pnr/mig_Data/BOOK_DATA_MIG_17JUNE_output.csv";
  res.sendFile(filepath, (error) => {
    console.log("error hallpendn  ", error);
    return res.status(500).send(error);
  });
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

// io.on("connection", (client) => {
//   let i = 0;
//   console.log("client connected in  migration");
//   client.on("join", (data) => {
//     console.log("data value " + data);
//     var interval = setInterval(() => {
//       console.log("allmessage");
//       console.log(allMessage);
//       while (allMessage.length > 0) {
//         let value = allMessage.shift();
//         client.emit("fromServer", value);
//       }
//     }, 3000);

//     setTimeout(() => {
//       console.log("clear called ");
//       clearInterval(interval);
//     }, 60 * 1000);
//   });
// });

// delete cs path

expressApp.post("/upload_deletcs_file", (req, res, next) => {
  if (!req.files || !Object.keys(req.files)) {
    return res
      .status(400)
      .send({ status: "FAILURE", message: "No file uploaded" });
  } else {
    const uploadedFile = req.files.file;
    uploadedFile.mv(`${DEELETE_CS_DIR}/${uploadedFile.name}`, (error) => {
      if (error) {
        return res.status(500).send({ status: "FAILURE", message: error });
      } else {
        return res.status(200).send({
          status: "SUCCESS",
          message: "SUCCESSFULLY UPLOADED",
          fileName: uploadedFile.name,
        });
      }
    });
  }
});

expressApp.post("/deletecs", (req, res, next) => {
  deletCS(`${DEELETE_CS_DIR}/${req.body.fileName}`)
    .then((delRes) => {
      return res.status(200).send(delRes);
    })
    .catch((error) => {
      console.log(JSON.stringify(error));
      return res
        .status(500)
        .send({ message: "Error whil delete " + JSON.stringify(error) });
    });
});
