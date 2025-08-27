import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({ storage }).fields([
  { name: "image", maxCount: 1 },      // cover image
  { name: "gallery", maxCount: 10 }    // gallery images
]);
