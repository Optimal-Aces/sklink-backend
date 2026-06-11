const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Get member documents
const getMemberDocuments = async (req, res) => {
  try {
    const [docs] = await db.query(
      'SELECT * FROM member_documents WHERE member_id = ? ORDER BY uploaded_at DESC',
      [req.params.memberId]
    );
    res.json(docs);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Upload document
const uploadDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const { memberId } = req.params;
  const { document_type } = req.body;

  if (!document_type) {
    return res.status(400).json({ message: 'Document type is required.' });
  }

  try {
    // Check member exists
    const [members] = await db.query(
      'SELECT id FROM members WHERE id = ?', [memberId]
    );
    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    const id = uuidv4();
    const file_url = `/uploads/${req.file.filename}`;

    await db.query(
      `INSERT INTO member_documents
        (id, member_id, document_type, file_url, review_status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [id, memberId, document_type, file_url]
    );

    res.status(201).json({
      message: 'Document uploaded successfully.',
      id,
      file_url
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Review document (approve or reject)
const reviewDocument = async (req, res) => {
  const { review_status } = req.body;

  if (!['approved', 'rejected'].includes(review_status)) {
    return res.status(400).json({ message: 'Status must be approved or rejected.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE member_documents SET review_status = ? WHERE id = ?',
      [review_status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }
    res.json({ message: `Document ${review_status} successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const [docs] = await db.query(
      'SELECT * FROM member_documents WHERE id = ?',
      [req.params.id]
    );
    if (docs.length === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '..', docs[0].file_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.query('DELETE FROM member_documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Document deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = {
  getMemberDocuments,
  uploadDocument,
  reviewDocument,
  deleteDocument
};