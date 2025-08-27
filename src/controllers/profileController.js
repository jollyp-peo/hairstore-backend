import { supabase } from "../config/supabaseClient.js";

export const getProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({ message: "Missing access token" });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // "PGRST116" = no rows found
      console.error("Get profile error:", error);
      return res.status(400).json({ message: error.message });
    }

    res.json({ profile: data || null });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ message: "Server error while fetching profile" });
  }
};

export const upsertProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({ message: "Missing access token" });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const {
      firstName,
      lastName,
      phone,
      address,
      city,
      state,
      zipCode,
      country,
    } = req.body;

    if (!firstName || !lastName || !phone || !address || !city || !state || !zipCode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { data, error } = await supabase.from("user_profiles").upsert({
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      phone,
      address,
      city,
      state,
      zip_code: zipCode,
      country: country || "Nigeria",
      updated_at: new Date().toISOString(),
    }).select();

    if (error) {
      console.error("Profile upsert error:", error);
      return res.status(400).json({ message: error.message });
    }

    res.json({
      message: "Profile saved successfully",
      profile: data[0],
    });
  } catch (err) {
    console.error("Profile save error:", err);
    res.status(500).json({ message: "Server error while saving profile" });
  }
};
