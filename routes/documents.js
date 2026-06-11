const express = require('express');
const router = express.Router();
const {
  getMemberDocuments,
  uploadDocument,
  reviewDocument,
  deleteDocument
} = require('../controllers/documentController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.get('/:memberId', verifyToken, verifyPermission('members.view'), getMemberDocuments);
router.post('/:memberId/upload', verifyToken, (req, res, next) => {
  const upload = req.app.locals.upload;
  upload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, uploadDocument);
router.patch('/:id/review', verifyToken, verifyPermission('members.verify'), reviewDocument);
router.delete('/:id', verifyToken, verifyPermission('members.edit'), deleteDocument);

module.exports = router;