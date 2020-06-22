/**
 * * http://jira.mmt.com/browse/FLT-573958
 * logic
 * 1. First check if data is present in mongo then skip
 * 2. IF not present then fetch from ravi api and insert in mongo
 * 3. keep status of each mmtid
 * 4. Check if it have credit shell mmt then insert that as well
 *
 */
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const xlsxFile = require("read-excel-file/node");
const fetch = require("node-fetch");

const INPUT_FILE_PATH =
  "/Users/mmt8210/Desktop/pnr/mig_Data/BOOK_DATA_MIG_17JUNE.xlsx";
const currentFilePath = INPUT_FILE_PATH.substring(
  0,
  INPUT_FILE_PATH.lastIndexOf(".")
);

const BOOK_DATA_BASE_URL_DEV = `http://localhost:8080/flights-pnr-service/v2/getAllByIdSource`;
//10.66.39.17:8004/flights-booking/v1/bookJson?mmtId=NF70114276514898

// RAVI DEV --> http://10.66.39.115:8004/flights-booking/v1/bookJson?mmtId=NN2110548054524
const GET_DATA_BASE_URL_STAGING = `http://10.66.39.115:8004/flights-booking/v1/bookJson`;

const UPLOAD_DATA_URL_DEV =
  "http://localhost:8080/flights-pnr-service/v2/bookdata-internal";

let creditShellData = new Set();

class ResponseStatus {
  constructor(isPresent, status, remark, data) {
    this.isPresent = isPresent;
    this.status = status;
    this.remark = remark;
    this.data = data;
  }
}

class BookDataRequest {
  constructor(lob, source, booking_id, postbook) {
    this.lob = lob;
    this.source = source;
    this.booking_id = booking_id;
    this.postbook = postbook;
  }
}

class CsvRowValue {
  constructor(booking_id, source, status, remark) {
    this.booking_id = booking_id;
    this.source = source;
    this.status = status;
    this.remark = remark;
  }
}

async function writeResultToCSV(records, filePath) {
  try {
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: "booking_id", title: "booking_id" },
        { id: "source", title: "source" },
        { id: "status", title: "status" },
        { id: "remark", title: "remark" },
      ],
    });
    await csvWriter.writeRecords(records);
    creditShellData.clear();
    console.log("succesfully written to csv file " + filePath);
  } catch (error) {
    console.log("Could not wrie to csv file " + filePath, error);
  }
}

async function getBookingIdFromExcel() {
  const allBookingIdsAndSouce = [];
  const rows = await xlsxFile(INPUT_FILE_PATH);
  rows.forEach((row, i) => {
    if (i != 0) {
      const booking_id = row[0].trim();
      if (booking_id != undefined) {
        allBookingIdsAndSouce.push({ booking_id });
      }
    }
  });
  return allBookingIdsAndSouce;
}

/**
 * this function checks if data is present in mongo db
 */
async function checkDataNotPresent(booking_id, source) {
  const response = await fetch(
    `${BOOK_DATA_BASE_URL_DEV}?booking_id=${booking_id}&source=${source}`
  );
  const data = await response.json();
  let isAbsent = false;
  let remark = "";
  let isBadRequest = false;

  if (response.status === 404) {
    isAbsent = true;
    remark = `Data not preset in mongo for bookingid ${booking_id} ${JSON.stringify(
      data
    )}`;
  } else if (response.status === 200) {
    remark = "Data preset in mongo for bookingid " + booking_id;
  } else {
    isBadRequest = true;
    remark = `Bad request ${response.status} ${JSON.stringify(data)}`;
  }
  return {
    isAbsent,
    remark,
    isBadRequest,
  };
}

/**
 * this fetch data from ravi api for minimal book json, this function response will be put in mongo db
 */
async function fetchData(booking_id) {
  let responseStatus = new ResponseStatus();
  let URL = `${GET_DATA_BASE_URL_STAGING}?mmtId=${booking_id}`;

  try {
    const response = await fetch(URL);
    const status = response.status;
    const data = await response.json();
    if (status === 200) {
      responseStatus.isPresent = true;
      responseStatus.status = "SUCCESS";
      responseStatus.data = data;
      await addCreditShellBookingId(data);
    } else {
      responseStatus.isPresent = false;
      responseStatus.status = "FAILURE";
      responseStatus.remark = JSON.stringify(data);
    }
  } catch (error) {
    responseStatus.isPresent = false;
    responseStatus.status = "FAILURE";
    responseStatus.remark = JSON.stringify(error);
    console.log("fetch data error ");
    console.log(error);
  }

  return responseStatus;
}

async function addCreditShellBookingId(data) {
  if (
    data !== undefined &&
    data.bookingInfo !== undefined &&
    data.bookingInfo.frInfo !== undefined &&
    data.bookingInfo.frInfo.bookingFareInfo !== undefined &&
    data.bookingInfo.frInfo.bookingFareInfo.creditShellData !== undefined &&
    data.bookingInfo.frInfo.bookingFareInfo.creditShellData.bkId !== undefined
  ) {
    let csvRowValue = new CsvRowValue();
    csvRowValue.booking_id = data.bookingInfo.frInfo.bookingFareInfo.creditShellData.bkId.trim();
    csvRowValue.source = data.metaData.source.trim();
    csvRowValue.status = "CREDIT_SHELL";
    csvRowValue.remark = `migrate this booking_id, its parent booking_id ${data.metaData.bookingId}`;
    creditShellData.add(csvRowValue);
  }
}

let postOption = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
};

async function migrateData(booking_id, source, fetchDataResponse) {
  let migrateDataResponse = new ResponseStatus();
  if (fetchDataResponse.isPresent) {
    // TODO ADD CREDIT SHELL
    const bookDataRequest = getBookDataRequest(
      fetchDataResponse.data,
      booking_id
    );
    try {
      const uploadResponse = await fetch(
        `${UPLOAD_DATA_URL_DEV}?booking_id=${booking_id}`,
        {
          ...postOption,
          body: JSON.stringify(bookDataRequest),
        }
      );
      const statusCode = uploadResponse.status;
      if (statusCode === 200) {
        migrateDataResponse.status = "SUCCESS";
        migrateDataResponse.remark = `Successfully uploaded data to mongo ${booking_id}`;
      } else {
        migrateDataResponse.status = "FAILURE";
        migrateDataResponse.remark = `Could not migrate  data ${fetchDataResponse.data} statusCode :  ${statusCode}`;
      }
    } catch (error) {
      migrateDataResponse.status = "FAILURE";
      migrateDataResponse.remark = `Error while  data  migration${fetchDataResponse.data}  ${error}`;
      console.log("------");
      console.log(error);
    }
  } else {
    migrateDataResponse.status = "FAILURE";
    migrateDataResponse.remark = `Could not get data from MYSQL ${booking_id} ${fetchDataResponse.remark} `;
  }
  return migrateDataResponse;
}

function getBookDataRequest(mysqlData, booking_id) {
  let bookDataRequest = new BookDataRequest();
  if (mysqlData.metaData === undefined) {
    throw "metdata not present can not create request ";
  } else if (mysqlData.metaData.lob === undefined) {
    throw "lob not present ";
  } else if (mysqlData.metaData.source === undefined) {
    throw "source not prsent ";
  }
  const metdata = mysqlData.metaData;
  bookDataRequest.lob = metdata.lob;
  bookDataRequest.source = metdata.source.toUpperCase();
  bookDataRequest.booking_id = booking_id;
  bookDataRequest.postbook = mysqlData;
  return bookDataRequest;
}

const startMsg = "";
let processMessage = "Hell process message";
let allMessage = [];

const startMigration = async () => {
  let OUTPUT_FILE_PATH = `${currentFilePath}_output_${getFileNameSuffix()}.csv`;

  OUTPUT_FILE_PATH = `${currentFilePath}_output.csv`;

  const csvData = [];
  const allBookingId = await getBookingIdFromExcel();
  for (let i = 0; i < allBookingId.length; i++) {
    const csvRowValue = new CsvRowValue();
    const booking_id = allBookingId[i].booking_id;
    csvRowValue.booking_id = booking_id;
    try {
      processMessage = "processig for booking id " + booking_id;
      console.log(processMessage);
      allMessage.push(processMessage);
      const fetchDataResponse = await fetchData(booking_id);
      if (fetchDataResponse.isPresent) {
        let bookDataRequest = getBookDataRequest(
          fetchDataResponse.data,
          booking_id
        );
        const source = bookDataRequest.source;
        csvRowValue.source = source;
        const mongoDataResponse = await checkDataNotPresent(booking_id, source);
        if (mongoDataResponse.isAbsent) {
          const migrateDataResponse = await migrateData(
            booking_id,
            source,
            fetchDataResponse
          );
          csvRowValue.status = migrateDataResponse.status;
          csvRowValue.remark = migrateDataResponse.remark;
          processMessage = "migration done for booking id " + booking_id;
          console.log(processMessage);
          allMessage.push(processMessage);
        } else if (mongoDataResponse.isBadRequest) {
          csvRowValue.status = "BAD REQUEST";
          csvRowValue.remark = mongoDataResponse.remark;
          processMessage = `migration failure bad request ${booking_id}  ${mongoDataResponse.remark}`;
          console.log(
            `migration failure bad request ${booking_id}  ${mongoDataResponse.remark}`
          );
          allMessage.push(processMessage);
        } else {
          csvRowValue.status = "ALREADY PRESENT";
          csvRowValue.remark = mongoDataResponse.remark;
          processMessage = `migration failure ${booking_id} already present ${mongoDataResponse.remark}`;
          console.log(
            `migration failure ${booking_id} already present ${mongoDataResponse.remark}`
          );
          allMessage.push(processMessage);
        }
      } else {
        csvRowValue.status = "FAILURE";
        csvRowValue.remark = fetchDataResponse.remark;
        processMessage = `migration failure ${booking_id}  ${fetchDataResponse.remark}`;
        allMessage.push(processMessage);
        console.log(
          `migration failure  ${booking_id}  ${fetchDataResponse.remark}`
        );
      }
    } catch (error) {
      processMessage = "processig failure for booking id " + booking_id;
      allMessage.push(processMessage);
      console.log("processig failure for booking id " + booking_id);
      console.log(error);
      csvRowValue.status = "FAILURE";
      csvRowValue.remark = JSON.stringify(error);
    }

    console.log("-------------");
    csvData.push(csvRowValue);
  }
  console.log("creditShellData --------");
  console.log(creditShellData);
  await writeResultToCSV([...csvData, ...creditShellData], OUTPUT_FILE_PATH);
  // await writeResultToCSV(creditShellData);
  return { fileName: "Datatt" };
};

function getFileNameSuffix() {
  const currentDate = new Date();
  return `${currentDate.getDate()}_${
    currentDate.getMonth() + 1
  }_${currentDate.getFullYear()}_${currentDate.getHours()}_${currentDate.getMinutes()}_${currentDate.getSeconds()}_${
    currentDate.getHours() >= 12 ? "PM" : "AM"
  }`;
}

module.exports = { startMigration, allMessage };
