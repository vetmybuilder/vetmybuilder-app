require("dotenv").config({ path: ".env.e2e.local" });

process.env.MYSQL_DATABASE = process.env.VMB_E2E_DB || process.env.MYSQL_DATABASE;
process.env.PORT = process.env.PORT || "3100";
process.env.TEST_ENV = process.env.TEST_ENV || "e2e";
process.env.TEST_TOTAL_SHARDS = process.env.TEST_TOTAL_SHARDS || "4";
process.env.TEST_SHARD = process.env.TEST_SHARD || "0";

require("../server/index.js");
