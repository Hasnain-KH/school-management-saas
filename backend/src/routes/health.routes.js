import express from "express";

const router = express.Router();

router.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "SchoolFlow API is healthy",
        data: null
    });
});

export default router; 