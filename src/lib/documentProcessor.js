// Simplified document processor for testing
class DocumentProcessor {
  constructor() {
    this.vectorStore = new Map(); // Simple in-memory vector store
    this.documents = [];
    this.isInitialized = false;
  }

  /**
   * Initialize by processing documents from assets folder
   */
  async initialize() {
    if (this.isInitialized) {
      return this.getStats();
    }

    console.log('🔄 Initializing document processor...');
    
    try {
      // Try to load documents from assets folder
      const assetsDocuments = await this.loadAssetsDocuments();
      
      if (assetsDocuments.length > 0) {
        console.log(`📄 Found ${assetsDocuments.length} documents in assets folder`);
        for (const doc of assetsDocuments) {
          await this.processDocument(doc);
        }
      } else {
        // No documents found in assets folder
        console.log('📄 No documents found in assets folder');
      }

      this.isInitialized = true;
      console.log(`✅ Document processing complete. ${this.documents.length} documents indexed.`);
      return this.getStats();
    } catch (error) {
      console.error('❌ Error initializing document processor:', error);
      this.isInitialized = true;
      return this.getStats();
    }
  }

  /**
   * Load documents from the assets folder
   */
  async loadAssetsDocuments() {
    const documents = [];
    
    try {
      console.log('🔍 Scanning assets folder for documents...');
      
      // Clear any existing documents to ensure fresh count
      this.documents = [];
      this.vectorStore.clear();
      
      // Try to discover files by attempting to load them
      const discoveredFiles = await this.discoverFilesInAssets();
      
      console.log(`📄 Discovered ${discoveredFiles.length} files in assets folder`);
      
      // Process each discovered file
      for (const fileName of discoveredFiles) {
        try {
          const encodedFileName = encodeURIComponent(fileName);
          const response = await fetch(`/assets/${encodedFileName}`);
          
          if (response.ok) {
            const file = await response.blob();
            console.log(`📄 Processing: ${fileName} (${file.size} bytes)`);
            
            const content = await this.extractTextFromFile(file, fileName);
            if (content && content.trim().length > 0) {
              documents.push({ fileName, content });
              console.log(`✅ Successfully processed: ${fileName} (${content.length} characters)`);
            } else {
              console.log(`❌ No content extracted from: ${fileName}`);
            }
          }
        } catch (error) {
          console.log(`❌ Error processing ${fileName}: ${error.message}`);
        }
      }
      
      console.log(`📊 Successfully processed ${documents.length} documents`);
      
      if (documents.length === 0) {
        console.log('💡 No documents found in assets folder. You can:');
        console.log('   1. Add files to the public/assets/ folder');
        console.log('   2. Use the "Upload docs" button to add documents');
        console.log('   3. Check that files have supported extensions (.pdf, .docx, .doc, .txt)');
      }
      
    } catch (error) {
      console.error('Error loading assets documents:', error);
    }

    return documents;
  }

  /**
   * Discover files in the assets folder using the relay server's /assets-manifest endpoint
   */
  async discoverFilesInAssets() {
    try {
      // Try to fetch from relay server (assume running on localhost:8082)
      const response = await fetch('http://localhost:8082/assets-manifest');
      if (!response.ok) {
        console.error('Could not load assets-manifest from relay server');
        return [];
      }
      const fileList = await response.json();
      if (!Array.isArray(fileList)) {
        console.error('assets-manifest is not an array');
        return [];
      }
      return fileList;
    } catch (error) {
      console.error('Error loading assets-manifest:', error);
      return [];
    }
  }

  /**
   * Check if a file exists in the assets folder
   */
  async fileExists(fileName) {
    try {
      const encodedFileName = encodeURIComponent(fileName);
      const response = await fetch(`/assets/${encodedFileName}`, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract text from uploaded file
   */
  async extractTextFromFile(file, fileName) {
    const fileType = fileName.split('.').pop().toLowerCase();
    
    try {
      switch (fileType) {
        case 'pdf':
          return await this.extractPDFText(file);
        case 'docx':
        case 'doc':
          return await this.extractWordText(file);
        case 'txt':
          return await this.extractTextFile(file);
        default:
          console.warn(`Unsupported file type: ${fileType}`);
          return null;
      }
    } catch (error) {
      console.error(`Error extracting text from ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Extract text from Word document
   */
  async extractWordText(file) {
    try {
      // Import mammoth dynamically to avoid import issues
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.default.extractRawText({ arrayBuffer });
      return result.value;
    } catch (error) {
      console.error('Error extracting Word document text:', error);
      return `[Error extracting text from Word document: ${error.message}]`;
    }
  }

  /**
   * Extract text from PDF file
   */
  async extractPDFText(file) {
    try {
      // For now, return a placeholder since PDF processing was causing issues
      return `[PDF content from ${file.name} - PDF processing will be implemented soon]`;
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      return `[Error extracting PDF text: ${error.message}]`;
    }
  }

  /**
   * Extract text from plain text file
   */
  async extractTextFile(file) {
    return await file.text();
  }

  /**
   * Load sample documents (fallback)
   */
  async loadSampleDocuments() {
    const sampleDocuments = [
      {
        fileName: 'IT_Procedures.pdf',
        content: `Page 1:
Password Reset Procedure
To reset your password, follow these steps:
1. Go to the company portal at portal.company.com
2. Click on "Forgot Password" link
3. Enter your employee ID and email address
4. Check your email for a reset link
5. Click the link and create a new password
6. Your new password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.

Page 2:
VPN Connection Setup
To connect to the company VPN:
1. Download the VPN client from the IT portal
2. Install the client on your computer
3. Open the VPN client and enter your credentials
4. Select the appropriate server location
5. Click "Connect" to establish the VPN connection
6. You should see a green indicator when connected successfully.

Page 3:
Software Installation Guidelines
When installing new software:
1. Always check with IT before installing any software
2. Download software only from official sources
3. Run virus scans on downloaded files
4. Follow the installation wizard carefully
5. Restart your computer if prompted
6. Contact IT support if you encounter any issues.`
      },
      {
        fileName: 'Employee_Handbook.docx',
        content: `Page 1:
Company Policies and Procedures
Welcome to our company! This handbook contains important information about our policies and procedures.

Working Hours:
- Standard work hours are 9:00 AM to 5:00 PM
- Flexible work arrangements are available with manager approval
- Overtime must be pre-approved by your supervisor

Page 2:
Benefits and Leave
Health Insurance:
- Medical, dental, and vision coverage available
- Coverage begins on the first day of the month following hire date
- Contact HR for enrollment information

Vacation Policy:
- 15 days of paid vacation per year
- Vacation requests must be submitted 2 weeks in advance
- Unused vacation days roll over to the next year

Page 3:
Professional Development
Training Opportunities:
- Annual training budget of $1,000 per employee
- Online courses and certifications available
- Conference attendance with manager approval
- Tuition reimbursement for relevant degree programs`
      }
    ];

    for (const doc of sampleDocuments) {
      await this.processDocument(doc);
    }
  }

  /**
   * Process uploaded files
   */
  async processUploadedFiles(files) {
    console.log(`📄 Processing ${files.length} uploaded files...`);
    
    for (const file of files) {
      try {
        const content = await this.extractTextFromFile(file, file.name);
        if (content) {
          await this.processDocument({ fileName: file.name, content });
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
      }
    }

    console.log(`✅ Upload processing complete. ${this.documents.length} total documents indexed.`);
    return this.getStats();
  }

  /**
   * Process a document
   */
  async processDocument(document) {
    const { fileName, content } = document;
    
    console.log(`📖 Processing: ${fileName}`);

    const metadata = {
      fileName,
      fileType: fileName.split('.').pop(),
      processedAt: new Date().toISOString()
    };

    if (content.trim()) {
      const chunks = this.createChunks(content, metadata);
      this.addToVectorStore(chunks);
      this.documents.push({
        fileName,
        chunks: chunks.length,
        content: content.substring(0, 200) + '...'
      });
    }
  }

  /**
   * Create chunks from content
   */
  createChunks(content, metadata, chunkSize = 500, overlap = 100) {
    const chunks = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let pageNum = 1;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: `${metadata.fileName}_chunk_${chunks.length + 1}`,
          content: currentChunk.trim(),
          metadata: {
            ...metadata,
            pageNum,
            chunkIndex: chunks.length + 1
          }
        });
        
        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5)); // Rough word count
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
      
      // Simple page detection (every ~300 words)
      if (currentChunk.split(' ').length > 300) {
        pageNum++;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `${metadata.fileName}_chunk_${chunks.length + 1}`,
        content: currentChunk.trim(),
        metadata: {
          ...metadata,
          pageNum,
          chunkIndex: chunks.length + 1
        }
      });
    }
    
    return chunks;
  }

  /**
   * Simple vector store implementation
   */
  addToVectorStore(chunks) {
    for (const chunk of chunks) {
      // Simple keyword-based indexing for now
      const keywords = this.extractKeywords(chunk.content);
      this.vectorStore.set(chunk.id, {
        chunk,
        keywords,
        embedding: this.simpleEmbedding(chunk.content)
      });
    }
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    return [...new Set(words)];
  }

  /**
   * Simple embedding function
   */
  simpleEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(1536).fill(0);
    
    for (let i = 0; i < Math.min(words.length, 1536); i++) {
      embedding[i] = words[i].length / 10;
    }
    
    return embedding;
  }

  /**
   * Search for relevant chunks
   */
  searchChunks(query, topK = 5) {
    const queryKeywords = this.extractKeywords(query);
    const results = [];
    
    for (const [id, entry] of this.vectorStore) {
      const relevance = this.calculateRelevance(queryKeywords, entry.keywords);
      if (relevance > 0) {
        results.push({
          ...entry.chunk,
          relevance,
          source: `${entry.chunk.metadata.fileName} (Page ${entry.chunk.metadata.pageNum})`
        });
      }
    }
    
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, topK);
  }

  /**
   * Calculate relevance between query and chunk
   */
  calculateRelevance(queryKeywords, chunkKeywords) {
    const intersection = queryKeywords.filter(keyword => 
      chunkKeywords.includes(keyword)
    );
    return intersection.length / Math.max(queryKeywords.length, 1);
  }

  /**
   * Get document statistics
   */
  getStats() {
    return {
      totalDocuments: this.documents.length,
      totalChunks: this.vectorStore.size,
      documents: this.documents.map(doc => ({
        fileName: doc.fileName,
        chunks: doc.chunks
      }))
    };
  }
}

export default DocumentProcessor; 