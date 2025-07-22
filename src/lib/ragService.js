import DocumentProcessor from './documentProcessor.js';

class RAGService {
  constructor() {
    this.documentProcessor = new DocumentProcessor();
    this.isInitialized = false;
    this.stats = null;
  }

  /**
   * Initialize the RAG system by processing documents
   */
  async initialize() {
    if (this.isInitialized) {
      return this.stats;
    }

    console.log('🚀 Initializing RAG system...');
    
    try {
      await this.documentProcessor.initialize();
      this.stats = this.documentProcessor.getStats();
      this.isInitialized = true;
      
      console.log('✅ RAG system initialized successfully');
      console.log(`📊 Stats: ${this.stats.totalDocuments} documents, ${this.stats.totalChunks} chunks`);
      
      return this.stats;
    } catch (error) {
      console.error('❌ Failed to initialize RAG system:', error);
      throw error;
    }
  }

  /**
   * Search for relevant document chunks
   */
  async searchDocuments(query, topK = 5) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`🔍 Searching for: "${query}"`);
    
    const results = this.documentProcessor.searchChunks(query, topK);
    
    console.log(`📋 Found ${results.length} relevant chunks`);
    
    return results.map(result => ({
      content: result.content,
      source: result.source,
      relevance: result.relevance,
      metadata: {
        fileName: result.metadata.fileName,
        pageNum: result.metadata.pageNum,
        chunkIndex: result.metadata.chunkIndex
      }
    }));
  }

  /**
   * Get document statistics
   */
  getStats() {
    return this.stats || { totalDocuments: 0, totalChunks: 0, documents: [] };
  }

  /**
   * Check if RAG system is ready
   */
  isReady() {
    return this.isInitialized && this.stats.totalChunks > 0;
  }

  /**
   * Get a formatted response with sources
   */
  formatResponseWithSources(query, searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return {
        answer: "I don't have any relevant information in my documents to answer that question.",
        sources: []
      };
    }

    const sources = searchResults.map(result => ({
      content: result.content,
      source: result.source,
      relevance: result.relevance
    }));

    const answer = `Based on my documents, here's what I found:\n\n${searchResults.map((result, index) => 
      `${index + 1}. ${result.content}\n   Source: ${result.source}`
    ).join('\n\n')}`;

    return {
      answer,
      sources
    };
  }
}

// Create a singleton instance
const ragService = new RAGService();

export default ragService; 