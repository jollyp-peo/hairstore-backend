import cloudinary from "../config/cloudinary.js";
import { supabase } from "../config/supabaseClient.js";
import slugify from "slugify";

// helper to upload a file buffer to cloudinary
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

// helper to generate a unique slug
const generateUniqueSlug = async (name) => {
	const baseSlug = slugify(name, { lower: true, strict: true });
	let slug = baseSlug;
	let counter = 1;

	// keep checking if slug exists in supabase
	while (true) {
		const { data, error } = await supabase
			.from("products")
			.select("id")
			.eq("slug", slug)
			.maybeSingle();

		if (error) throw error;
		if (!data) break; // slug is free

		slug = `${baseSlug}-${counter++}`;
	}

	return slug;
};

// CREATE PRODUCT
export const createProduct = async (req, res) => {
	try {
		const {
			name,
			price,
			original_price,
			category,
			featured,
			in_stock,
			rating,
			reviews,
			details,
		} = req.body;

		// auto-generate slug
		const slug = await generateUniqueSlug(name);

		// handle cover image
		let imageUrl = null;
		if (req.files?.image) {
			const uploadResult = await streamUpload(req.files.image[0].buffer);
			imageUrl = uploadResult.secure_url;
		}

		// handle gallery images
		let galleryUrls = [];
		if (req.files?.gallery) {
			for (const file of req.files.gallery) {
				const uploadResult = await streamUpload(file.buffer);
				galleryUrls.push(uploadResult.secure_url);
			}
		}

		// insert product
		const { data: product, error } = await supabase
			.from("products")
			.insert([
				{
					name,
					slug,
					price,
					original_price,
					category,
					featured,
					in_stock,
					rating: rating || 0,
					reviews: reviews || 0,
					image: imageUrl,
				},
			])
			.select()
			.single();

		if (error) throw error;

		// insert details if provided
		if (details) {
			const detailsObj =
				typeof details === "string" ? JSON.parse(details) : details;
			detailsObj.images = galleryUrls; // attach gallery

			const { data: productDetail, error: detailError } = await supabase
				.from("product_details")
				.insert([{ product_id: product.id, ...detailsObj }])
				.select()
				.single();

			if (detailError) throw detailError;
			product.details = productDetail;
		}

		res.status(201).json(product);
	} catch (err) {
		console.error("Create product error:", err);
		res.status(500).json({ error: err.message });
	}
};

// // GET PRODUCTS 
// export const getProducts = async (req, res) => {
// 	try {
// 		const { data, error } = await supabase
// 			.from("products")
// 			.select("*")
// 			.order("created_at", { ascending: false });

// 		if (error) throw error;
// 		res.json(data);
// 	} catch (err) {
// 		res.status(500).json({ error: err.message });
// 	}
// };


// GET PRODUCTS (with pagination, search, filter, sort)
export const getProducts = async (req, res) => {
	try {
		let {
			page = 1,
			limit = 10,
			search = "",
			category = "",
			sortBy = "created_at",
			order = "desc", // "asc" | "desc"
		} = req.query;

		page = parseInt(page, 10);
		limit = parseInt(limit, 10);
		const from = (page - 1) * limit;
		const to = from + limit - 1;

		// Base query
		let query = supabase.from("products").select("*", { count: "exact" });

		// Search by name
		if (search) {
			query = query.ilike("name", `%${search}%`);
		}

		// Filter by category
		if (category && category !== "all") query = query.eq("category", category);

		// Sorting
		if (sortBy) {
			query = query.order(sortBy, { ascending: order === "asc" });
		}

		// Pagination
		query = query.range(from, to);

		// Execute
		const { data, error, count } = await query;
		if (error) throw error;

		res.json({
			products: data,
			pagination: {
				page,
				limit,
				total: count,
				totalPages: Math.ceil(count / limit),
			},
		});
	} catch (err) {
		console.error("Get products error:", err);
		res.status(500).json({ error: err.message });
	}
};


// GET PRODUCT BY ID
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

// UPDATE PRODUCT 
export const updateProduct = async (req, res) => {
	try {
		const { id } = req.params;
		const { details, name, ...updates } = req.body;

		// If name is updated, regenerate slug
		if (name) {
			updates.slug = await generateUniqueSlug(name);
		}

		// cover image update
		if (req.files?.image) {
			const uploadResult = await streamUpload(req.files.image[0].buffer);
			updates.image = uploadResult.secure_url;
		}

		// gallery update
		let galleryUrls = [];
		if (req.files?.gallery) {
			for (const file of req.files.gallery) {
				const uploadResult = await streamUpload(file.buffer);
				galleryUrls.push(uploadResult.secure_url);
			}
		}

		// update product
		const { data: updated, error } = await supabase
			.from("products")
			.update({ ...updates, updated_at: new Date() })
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;

		// update details
		if (details) {
			const detailsObj =
				typeof details === "string" ? JSON.parse(details) : details;
			if (galleryUrls.length) detailsObj.images = galleryUrls;

			await supabase
				.from("product_details")
				.upsert({ product_id: id, ...detailsObj, updated_at: new Date() });
		}

		res.json(updated);
	} catch (err) {
		console.error("Update product error:", err);
		res.status(500).json({ error: err.message });
	}
};

// DELETE PRODUCT 
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
