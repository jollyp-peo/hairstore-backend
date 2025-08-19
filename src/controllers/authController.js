import { supabase } from '../config/supabaseClient.js';

// Signup
export const signup = async (req, res) => {
  try {
    const { email, password, first_name, last_name, username } = req.body;

    if (!email || !password || !first_name || !last_name || !username) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('username')
      .eq('username', username.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // 1. Create in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) return res.status(400).json({ message: authError.message });

    // 2. Create in users table with default 'user' role
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        username: username.toLowerCase(),
        first_name,
        last_name,
        role: 'user' // Default role
      });

    if (insertError) {
      // Cleanup: Remove the auth user if database insert fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ message: insertError.message });
    }

    res.status(201).json({
      message: 'Signup successful',
      user: { 
        id: authData.user.id, 
        email, 
        username, 
        first_name, 
        last_name,
        role: 'user'
      },
      session: authData.session,
      token: authData.session?.access_token
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Login with username or email
export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Password and either username or email are required' });
    }

    let userEmail = identifier;

    // If it's a username, fetch email
    if (!identifier.includes('@')) {
      const { data: userRow, error: lookupError } = await supabase
        .from('users')
        .select('email')
        .eq('username', identifier.toLowerCase())
        .single();

      if (lookupError || !userRow) {
        return res.status(400).json({ message: 'Invalid username or password' });
      }

      userEmail = userRow.email;
    }

    // Login with Supabase Auth
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password
    });

    if (loginError) {
      return res.status(400).json({ message: loginError.message });
    }

    // Get user data with role from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', loginData.user.id)
      .single();

    if (userError || !userData) {
      return res.status(500).json({ message: 'Failed to fetch user data' });
    }

    res.json({
      message: 'Login successful',
      user: userData, // Include role and all user data
      session: loginData.session,
      token: loginData.session?.access_token
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};



// googleOAuthCallback

export const googleOAuthCallback = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      return res.status(401).json({ message: "Missing access token" });
    }

    // Verify token and get user from Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error("Token verification error:", error);
      return res.status(401).json({ message: "Invalid token" });
    }

    // Check if user already exists in our users table
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", user.email)
      .maybeSingle();
    
    if (fetchError) {
      console.error("Database fetch error:", fetchError);
      return res.status(500).json({ message: "Server error during user lookup" });
    }

    // If user doesn't exist, create them in the users table
    if (!existingUser) {
      // Extract and clean name from user metadata
      const fullName = user.user_metadata?.full_name || "";
      const nameParts = fullName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      // Generate unique username
      let baseUsername = user.user_metadata?.user_name || 
                        user.user_metadata?.preferred_username || 
                        user.email.split("@")[0];
      
      // Clean username - remove special characters, make lowercase
      baseUsername = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, "");
      
      // Ensure username is not empty
      if (!baseUsername) {
        baseUsername = `user${Date.now()}`;
      }

      // Check for username uniqueness and create unique one if needed
      let username = baseUsername;
      let counter = 1;
      let isUnique = false;

      while (!isUnique) {
        const { data: existingUsername, error: usernameCheckError } = await supabase
          .from("users")
          .select("username")
          .eq("username", username)
          .maybeSingle();

        if (usernameCheckError) {
          console.error("Username check error:", usernameCheckError);
          return res.status(500).json({ message: "Error checking username availability" });
        }

        if (!existingUsername) {
          isUnique = true;
        } else {
          username = `${baseUsername}${counter}`;
          counter++;
          // Prevent infinite loop
          if (counter > 1000) {
            username = `${baseUsername}${Date.now()}`;
            break;
          }
        }
      }

      // Insert new user into users table with default role
      const { error: insertError } = await supabase
        .from("users")
        .insert({
          id: user.id,
          email: user.email,
          username: username,
          first_name: firstName,
          last_name: lastName,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          role: 'user' // Default role for Google users
        });
      
      if (insertError) {
        console.error("Database insert error:", insertError);
        return res.status(500).json({ 
          message: "Failed to create user in database",
          error: insertError.message 
        });
      }

      console.log(`New Google user created: ${user.email} with username: ${username}`);
    } else {
      // User exists, optionally update avatar if it's changed
      if (user.user_metadata?.avatar_url && 
          user.user_metadata.avatar_url !== existingUser.avatar_url) {
        const { error: updateError } = await supabase
          .from("users")
          .update({ avatar_url: user.user_metadata.avatar_url })
          .eq("id", user.id);

        if (updateError) {
          console.error("Avatar update error:", updateError);
          // Don't fail the request for avatar update error
        }
      }
    }

    // Get the complete user data to return (including role)
    const { data: completeUser, error: finalFetchError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (finalFetchError) {
      console.error("Final user fetch error:", finalFetchError);
      return res.status(500).json({ message: "Error retrieving user data" });
    }

    // Send success response with user data including role
    res.status(200).json({
      message: "Google login successful",
      user: completeUser, // Includes role field
      token: token
    });

  } catch (err) {
    console.error("Google callback error:", err);
    res.status(500).json({ 
      message: "Server error during Google authentication",
      error: err.message 
    });
  }

};

// Refresh token
export const refreshAccessToken = async (req, res) => {
  try {
    const refresh_token = req.body.refresh_token;
    if (!refresh_token) return res.status(400).json({ message: 'No refresh token provided' });

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error) return res.status(400).json({ message: error.message });

    res.json({
      message: 'Token refreshed',
      session: data.session
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


export const getAllUsers = (req, res)=>{
  console.log('users')
}