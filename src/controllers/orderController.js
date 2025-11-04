import { supabase } from "../config/supabaseClient.js";

//  Create order (usually after payment success)
export const createOrder = async (req, res) => {
  try {
    const { user } = req;
    const { payment_reference, cart, amount } = req.body;

    if (!payment_reference || !cart || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Create order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        payment_reference,
        amount,
        status: "processing",
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Create order_items
    const orderItems = cart.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity,
    }));

    const { error: itemErr } = await supabase
      .from("order_items")
      .insert(orderItems);
    if (itemErr) throw itemErr;

    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error("[CREATE ORDER]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create order" });
  }
};

//  Get all orders for logged-in user
export const getUserOrders = async (req, res) => {
  try {
    const { user } = req;

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, order_items(*, products(name, cover_image))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error("[GET USER ORDERS]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch orders" });
  }
};

//  Get one order by ID for user
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*, products(name, cover_image))")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("[GET ORDER BY ID]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch order" });
  }
};

//  Admin: Get all orders
export const adminGetOrders = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*, users(email, username, first_name, last_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[ADMIN GET ORDERS]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch orders" });
  }
};

//  Admin: Update order (status, delivery date, shipping)
export const adminUpdateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, shipping_status, delivery_date } = req.body;

    const { data, error } = await supabase
      .from("orders")
      .update({
        status,
        shipping_status,
        delivery_date,
        updated_at: new Date(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[ADMIN UPDATE ORDER]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update order" });
  }
};
