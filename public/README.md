# Document Assets Folder

This folder is where you can place your PDF, Word, and text documents for RAG (Retrieval-Augmented Generation) processing.

## Supported File Types
- **PDF** (.pdf) - Extracts text from all pages
- **Word Documents** (.docx, .doc) - Extracts text content
- **Text Files** (.txt) - Plain text files

## How to Use

### Option 1: Place Files in Assets Folder
1. Copy your documents to this `public/assets/` folder
2. Supported filenames: `document1.pdf`, `document2.docx`, `manual.pdf`, `guide.docx`, `procedures.pdf`, `handbook.docx`
3. Click "Init RAG" button in the app to process these documents

### Option 2: Upload Files via UI
1. Click "Upload docs" button in the app
2. Drag and drop your files or click to browse
3. Click "Process Documents" to extract and index the content

## Example Documents
You can add documents like:
- Company policies and procedures
- Technical manuals and guides
- Employee handbooks
- Training materials
- FAQ documents
- Any text-based content you want to query

## How RAG Works
1. Documents are processed and split into chunks
2. Each chunk is indexed with keywords for search
3. When you ask a question, the system searches for relevant chunks
4. The AI uses these chunks to provide accurate, sourced answers
5. You'll see which document and page the information came from

## Tips
- Use descriptive filenames
- Ensure documents have clear, readable text
- For best results, use documents with structured content
- The system works best with documents that have specific information (procedures, policies, guides, etc.) 