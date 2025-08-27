import { supabase } from '../config/supabaseClient.js'

// Get all addresses for logged-in user
export const getAddresses = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", req.user.id) // req.user is set by protect middleware
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch addresses" });
  }
};

// Add new address
export const addAddress = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      phone,
      address,
      city,
      state,
      zip_code,
      country,
      is_default,
    } = req.body;

    if (is_default) {
      // unset old defaults for this user
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", req.user.id);
    }

    const { data, error } = await supabase
      .from("addresses")
      .insert([
        {
          user_id: req.user.id,
          first_name,
          last_name,
          phone,
          address,
          city,
          state,
          zip_code,
          country,
          is_default: is_default || false,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: "Failed to add address" });
  }
};

// Update existing address
export const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      phone,
      address,
      city,
      state,
      zip_code,
      country,
      is_default,
    } = req.body;

    if (is_default) {
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", req.user.id);
    }

    const { data, error } = await supabase
      .from("addresses")
      .update({
        first_name,
        last_name,
        phone,
        address,
        city,
        state,
        zip_code,
        country,
        is_default: is_default || false,
      })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Failed to update address" });
  }
};

// Delete address
export const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("addresses")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user.id);

    if (error) throw error;
    res.json({ message: "Address deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete address" });
  }
};
