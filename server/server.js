const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const pdf = require('pdf-parse');
const fileUploader = require('express-fileupload');
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
const PORT = 8800;

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUploader());

// Ensure the /tmp directory exists
const uploadDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.post('/summary', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No file uploaded. Try again');
  }

  const sampleFile = req.files.uploadedFile;
  const uploadPath = path.join(uploadDir, `${Date.now()}-${sampleFile.name}`);

  sampleFile.mv(uploadPath, async (err) => {
    if (err) {
      console.error('File upload error:', err);
      return res.status(500).send('Failed to upload file.');
    }

    console.log('File uploaded to:', uploadPath);

    try {
      const dataBuffer = fs.readFileSync(uploadPath);
      const data = await pdf(dataBuffer);

      console.log('Parsed PDF text:', data.text);

      const completionResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: `${data.text}\n\nTl;dr` }],
        temperature: 0.1,
        max_tokens: 50,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0.5,
      });

      fs.unlinkSync(uploadPath);

      res.json({
        id: Date.now(),
        text: completionResponse.choices[0].message.content,
      });
    } catch (error) {
      console.error('Error processing file or OpenAI request:', error);
      try {
        fs.unlinkSync(uploadPath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
      res.status(500).send('An error occurred while processing the file.');
    }
  });
});

app.listen(PORT, () => {
  console.log('Listening on PORT: ' + PORT);
});
