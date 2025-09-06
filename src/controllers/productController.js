import cloudinary from "../config/cloudinary.js";
import { supabase } from "../config/supabaseClient.js";
import slugify from "slugify";

//Helper: Upload buffer to Cloudinary
const streamUpload = (fileBuffer, folder = "products") => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{ folder },
			(error, result) => {
				if (result) resolve(result);
				else reject(error);
			}
		);
		stream.end(fileBuffer);
	});
};

// Helper: Extract Cloudinary public_id from URL
const getPublicIdFromUrl = (url) => {
	if (!url) return null;
	const parts = url.split("/");
	const fileWithExt = parts.pop();
	const folder = parts.slice(parts.indexOf("upload") + 1).join("/"); // "products"
	const publicId = fileWithExt.split(".")[0]; // "abc123"
	return `${folder}/${publicId}`;
};

// Helper: Generate unique slug
const generateUniqueSlug = async (name) => {
	const baseSlug = slugify(name, { lower: true, strict: true });
	let slug = baseSlug;
	let counter = 1;

	while (true) {
		const { data, error } = await supabase
			.from("products")
			.select("id")
			.eq("slug", slug)
			.maybeSingle();

		if (error) throw error;
		if (!data) break;

		slug = `${baseSlug}-${counter++}`;
	}

	return slug;
};

// CREATE Product
export const createProduct = async (req, res) => {
	try {
		const { name, category, featured, in_stock, rating, reviews, details, variants } =
			req.body;

		const slug = await generateUniqueSlug(name);

		// cover image
		let cover_image = null;
		if (req.files?.image?.[0]) {
			const uploadRes = await streamUpload(req.files.image[0].buffer);
			cover_image = uploadRes.secure_url;
		}

		// insert product
		const { data: product, error: productError } = await supabase
			.from("products")
			.insert([
				{
					name,
					slug,
					category,
					featured,
					in_stock,
					rating,
					reviews,
					cover_image,
				},
			])
			.select()
			.single();

		if (productError) throw productError;

		// insert details
		if (details) {
			const parsedDetails = typeof details === "string" ? JSON.parse(details) : details;
			await supabase.from("product_details").insert([
				{
					product_id: product.id,
					...parsedDetails,
				},
			]);
		}

		// insert variants
		if (variants) {
			const parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;

			for (let i = 0; i < parsedVariants.length; i++) {
				let variantImage = null;
				if (req.files?.variants?.[i]) {
					const uploadRes = await streamUpload(req.files.variants[i].buffer);
					variantImage = uploadRes.secure_url;
				}

				await supabase.from("product_variants").insert([
					{
						product_id: product.id,
						...parsedVariants[i],
						image: variantImage,
					},
				]);
			}
		}

		res.status(201).json({ success: true, data: product });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, error: err.message });
	}
};

// GET Products (pagination, filter, sort, search)
export const getProducts = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 20,
			sortBy = "created_at",
			order = "desc",
			search = "",
			category,
			featured,
			in_stock,
		} = req.query;

		const from = (page - 1) * limit;
		const to = from + Number(limit) - 1;

		let query = supabase.from("products").select("*", { count: "exact" });

		if (search) query = query.ilike("name", `%${search}%`);
		if (category) query = query.eq("category", category);
		if (featured !== undefined) query = query.eq("featured", featured === "true");
		if (in_stock !== undefined) query = query.eq("in_stock", in_stock === "true");

		query = query.order(sortBy, { ascending: order === "asc" });
		query = query.range(from, to);

		const { data, error, count } = await query;
		if (error) throw error;

		res.json({
			success: true,
			data,
			pagination: {
				total: count,
				page: Number(page),
				limit: Number(limit),
				totalPages: Math.ceil(count / limit),
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, error: err.message });
	}
};

// GET Single Product
export const getProductById = async (req, res) => {
	try {
		const { id } = req.params;

		// Fetch product
		const { data: product, error: productError } = await supabase
			.from("products")
			.select("*")
			.eq("id", id)
			.single();
		if (productError) throw productError;

		// Fetch details
		const { data: details, error: detailsError } = await supabase
			.from("product_details")
			.select("*")
			.eq("product_id", id)
			.single();
		if (detailsError && detailsError.code !== "PGRST116") throw detailsError;

		// Fetch variants
		const { data: variants, error: variantsError } = await supabase
			.from("product_variants")
			.select("*")
			.eq("product_id", id);
		if (variantsError) throw variantsError;

		res.json({
			success: true,
			data: {
				...product,
				details: details || null,
				variants: variants || [],
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, error: err.message });
	}
};

// UPDATE Product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Separate details & variants so they don’t leak into products update
    const { details, variants, ...productUpdates } =
      typeof updates === "string" ? JSON.parse(updates) : updates;

    // fetch old product for image cleanup
    const { data: oldProduct } = await supabase
      .from("products")
      .select("cover_image")
      .eq("id", id)
      .single();

    // cover image update
    if (req.files?.image?.[0]) {
      if (oldProduct?.cover_image) {
        const oldId = getPublicIdFromUrl(oldProduct.cover_image);
        if (oldId) await cloudinary.uploader.destroy(oldId);
      }
      const uploadRes = await streamUpload(req.files.image[0].buffer);
      productUpdates.cover_image = uploadRes.secure_url;
    }

    // update base product only
    const { data: product, error: productError } = await supabase
      .from("products")
      .update({ ...productUpdates, updated_at: new Date() })
      .eq("id", id)
      .select()
      .single();
    if (productError) throw productError;

    // update details
    if (details) {
      const parsedDetails =
        typeof details === "string" ? JSON.parse(details) : details;
      await supabase
        .from("product_details")
        .update({ ...parsedDetails, updated_at: new Date() })
        .eq("product_id", id);
    }

    // update/add variants
    if (variants) {
      const parsedVariants =
        typeof variants === "string" ? JSON.parse(variants) : variants;

      // fetch old variants for cleanup
      const { data: oldVariants } = await supabase
        .from("product_variants")
        .select("id,color,length,lace,image")
        .eq("product_id", id);

      for (let i = 0; i < parsedVariants.length; i++) {
        let variantImage = null;
        if (req.files?.variants?.[i]) {
          const old = oldVariants?.[i];
          if (old?.image) {
            const oldId = getPublicIdFromUrl(old.image);
            if (oldId) await cloudinary.uploader.destroy(oldId);
          }
          const uploadRes = await streamUpload(req.files.variants[i].buffer);
          variantImage = uploadRes.secure_url;
        }

        const existing = oldVariants?.find(
          (v) =>
            v.color === parsedVariants[i].color &&
            v.length === parsedVariants[i].length &&
            v.lace === parsedVariants[i].lace
        );

        if (existing) {
          await supabase
            .from("product_variants")
            .update({
              ...parsedVariants[i],
              image: variantImage || parsedVariants[i].image,
              updated_at: new Date(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_variants").insert([
            {
              product_id: id,
              ...parsedVariants[i],
              image: variantImage,
            },
          ]);
        }
      }
    }

    res.json({ success: true, data: product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};


// DELETE Product
export const deleteProduct = async (req, res) => {
	try {
		const { id } = req.params;

		// fetch product + variants
		const { data: product } = await supabase
			.from("products")
			.select("cover_image")
			.eq("id", id)
			.single();

		const { data: variants } = await supabase
			.from("product_variants")
			.select("image")
			.eq("product_id", id);

		// delete images from Cloudinary
		if (product?.cover_image) {
			const publicId = getPublicIdFromUrl(product.cover_image);
			if (publicId) await cloudinary.uploader.destroy(publicId);
		}
		if (variants?.length) {
			for (const v of variants) {
				if (v.image) {
					const publicId = getPublicIdFromUrl(v.image);
					if (publicId) await cloudinary.uploader.destroy(publicId);
				}
			}
		}

		// delete product (cascade removes details + variants)
		const { error } = await supabase.from("products").delete().eq("id", id);
		if (error) throw error;

		res.json({ success: true, message: "Product and images deleted" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, error: err.message });
	}
};
