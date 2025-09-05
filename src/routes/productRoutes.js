import express from "express";
import { productUpload } from "../middleware/upload.js";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
} from "../controllers/productController.js";

const router = express.Router();

router.post("/",  productUpload, createProduct); // requireAdmin,
router.put("/:id", requireAdmin, productUpload, updateProduct);
router.delete("/:id", requireAdmin, deleteProduct);

// Public routes
router.get("/", getProducts);
router.get("/:id", getProductById);


export default router;