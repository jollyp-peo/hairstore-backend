import cloudinary from "../config/cloudinary.js";
import { supabase } from "../config/supabaseClient.js";

// Create product
export const createProduct = async (req, res) => {
  try {
    const { name, slug, price, original_price, category, featured, in_stock, details } = req.body;

    let imageUrl = null;

    // If file uploaded, send to Cloudinary
    if (req.file) {
      const result = await cloudinary.uploader.upload_stream(
        { folder: "products" },
        (error, result) => {
          if (error) throw error;
          return result;
        }
      );

      imageUrl = result.secure_url;
    }

    // insert product
    const { data: product, error } = await supabase
      .from("products")
      .insert([{ name, slug, price, original_price, category, featured, in_stock, image: imageUrl }])
      .select()
      .single();

    if (error) throw error;

    // insert details if provided
    if (details) {
      const { data: productDetail, error: detailError } = await supabase
        .from("product_details")
        .insert([{ product_id: product.id, ...details }])
        .select()
        .single();

      if (detailError) throw detailError;
      product.details = productDetail;
    }

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Get all products
export const getProducts = async (req, res) => {
  try {
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single product + details
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: product, error } = await supabase
      .from("products")
      .select("*, product_details(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { details, ...updates } = req.body;

    const { data: updated, error } = await supabase
      .from("products")
      .update({ ...updates, updated_at: new Date() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (details) {
      await supabase
        .from("product_details")
        .upsert({ product_id: id, ...details, updated_at: new Date() });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
