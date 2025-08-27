import express from "express";
import { getProfile, upsertProfile } from "../controllers/profileController.js";
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get("/", protect, getProfile);
router.post("/", protect,  upsertProfile);

export default router;
