import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error("Only images are allowed!"), false);
	}
};

export const upload = multer({ storage, fileFilter });

// Define accepted fields (cover + variants)
export const productUpload = upload.fields([
	{ name: "image", maxCount: 1 },     // cover image
	{ name: "variants", maxCount: 20 }, // multiple variant images
]);
