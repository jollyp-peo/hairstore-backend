import dotenv from "dotenv";
dotenv.config();

export const monnifyConfig = {
  apiKey: process.env.MONNIFY_APIKEY,
  secretKey: process.env.MONNIFY_SECRET,
  contractCode: process.env.MONNIFY_CONTRACT_CODE,
  baseUrl: process.env.MONNIFY_BASE_URL,
};
