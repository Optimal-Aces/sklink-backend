const express = require('express');
const router = express.Router();
const {
  getAllPosts, getPostById, createPost,
  updatePost, deletePost
} = require('../controllers/transparencyController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.get('/', verifyToken, verifyPermission('transparency.view'), getAllPosts);
router.get('/:id', verifyToken, verifyPermission('transparency.view'), getPostById);
router.post('/', verifyToken, verifyPermission('transparency.create'), createPost);
router.put('/:id', verifyToken, verifyPermission('transparency.edit'), updatePost);
router.delete('/:id', verifyToken, verifyPermission('transparency.delete'), deletePost);

module.exports = router;