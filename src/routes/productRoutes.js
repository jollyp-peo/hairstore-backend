import express from "express";
import { productUpload } from "../middleware/upload.js";
import { protect, requireAdmin } from "../middleware/authMiddleware.js";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
} from "../controllers/productController.js";

const router = express.Router();

router.post("/",  protect, requireAdmin, productUpload, createProduct); 
router.put("/:id", protect, requireAdmin, productUpload, updateProduct);
router.delete("/:id", protect, requireAdmin, deleteProduct);

// Public routes
router.get("/", getProducts);
router.get("/:id", getProductById);


export default router;