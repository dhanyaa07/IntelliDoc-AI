
This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pixel-perfect-replica-6169.lovable.app
# 📄 IntelliDoc AI

**IntelliDoc AI** is a **RAG-based document intelligence platform** that allows users to upload documents and ask questions in natural language.

It retrieves relevant information from the document and generates **context-grounded answers along with the source page number**, making responses easy to verify.

## ✨ Features

* 📄 Upload and process documents
* 🔍 Semantic search using embeddings
* 🤖 RAG-based question answering
* 📚 **Page-level source references**
* 💬 Natural-language document Q&A
* 🎯 Context-grounded responses

## 🔄 How It Works

```text
Document
   ↓
Text Extraction & Chunking
   ↓
Embeddings
   ↓
Vector Database
   ↓
User Query
   ↓
Relevant Chunks Retrieved
   ↓
LLM + Context
   ↓
Answer + 📄 Page Number
```

## 🧠 RAG Pipeline

When a user asks a question, IntelliDoc AI retrieves the most relevant document chunks and provides them as context to the LLM. The system also preserves page metadata and displays the **source page** with the answer.

## 🛠️ Tech Stack

* Python
* RAG
* LLM
* Embeddings
* Vector Database
* Document Processing
* AI/ML

>
