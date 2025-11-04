import express from "express";
import {
  createOrder,
  getUserOrders,
  getOrderById,
  adminGetOrders,
  adminUpdateOrder,
} from "../controllers/orderController.js";
import { protect, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes
router.post("/", protect, createOrder);
router.get("/", protect, getUserOrders);
router.get("/:id", protect, getOrderById);

// Admin routes
router.get("/admin/all", protect, requireAdmin, adminGetOrders);
router.put("/admin/:id", protect, requireAdmin, adminUpdateOrder);

export default router;
