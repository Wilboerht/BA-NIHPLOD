import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function run() {
  const { verifyCertificateAction } = require("../app/actions");
  const result = await verifyCertificateAction("12121212");
  console.log(JSON.stringify(result, null, 2));
}

run();
