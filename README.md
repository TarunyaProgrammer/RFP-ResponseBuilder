# 🚀 RFP Velocity

### _AI-Powered RFP → Proposal Automation for FMCG Suppliers_

Transform unstructured RFP documents into structured, priced, ready-to-send proposals — in minutes, not days.

---

# 📘 Table of Contents

1. [Overview](#-overview)
2. [Key Features](#-key-features)
3. [System Architecture](#-system-architecture)
4. [Tech Stack](#-tech-stack)
5. [Setup & Installation](#-setup--installation)
6. [How It Works](#-how-it-works)
7. [API Endpoints](#-api-endpoints)
8. [File Formats](#-file-formats)
9. [Future Enhancements](#-future-enhancements)
10. [Contributors](#-contributors)

---

# ⭐ Overview

**RFP Velocity** is a minimal yet high-impact solution that automates the entire RFP response workflow for FMCG suppliers.

### 💡 What It Does

- Reads raw RFP text (from PDF extraction or direct paste)
- Extracts buyer metadata, deadlines, requirements
- Parses line items & quantities accurately
- Matches items to SKUs using hybrid AI (keyword + LLM reasoning)
- Generates pricing using base cost + margin %
- Produces a professional proposal (HTML / PDF / DOCX)

Built to be **lightweight, fast, and hackathon-friendly**, while delivering real enterprise value.

---

# 🚀 Key Features

### 🔍 Intelligent RFP Understanding

- Extracts buyer name, deadlines, summary
- Detects mandatory requirements & disqualification rules
- Handles unstructured/messy text

### 📦 Line Item Extraction

- Identifies product descriptions
- Extracts quantities, pack sizes, units, and remarks
- Works even when RFP tables are poorly formatted

### 🎯 SKU Matching (Hybrid Model)

- Token-based lexical matching for high speed
- LLM-powered reasoning for semantic matching
- Confidence scoring for transparency
- Rejects mismatches (ex: beverage ≠ cleaning liquid)

### 💸 Automated Pricing Engine

- Reads SKU base cost from CSV
- Applies configurable margin %
- Auto-calculates unit & total pricing
- Ensures consistency across proposals

### 📄 Proposal Generation

- Clean corporate HTML layout
- Industry-standard formatting
- Supports **HTML / PDF / DOCX** export
- Ready for client submission

---

# 🏗 System Architecture

```
┌─────────────────┐
│   Frontend       │  HTML + CSS + JS
│  (PWA-like)      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│       Backend API        │ Express.js
│ - SKU Upload             │
│ - RFP Analysis           │
│ - Line Item Extraction   │
│ - SKU Matching           │
│ - Pricing Engine         │
│ - Proposal Generation    │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────┐
│   Groq LLM (Llama 3)     │
│ - JSON-structured outputs│
│ - Strict prompts         │
└──────────────────────────┘
```

---

# 🛠 Tech Stack

### **Frontend**

- HTML5
- CSS3
- Vanilla JavaScript
- Clean enterprise UI design
- Zero dependencies

### **Backend**

- **Node.js**
- **Express.js**
- Multer (CSV upload)
- csv-parse (SKU ingestion)

### **AI Layer**

- **Groq API**
- OpenAI-compatible endpoints
- Llama-3 models for:
  - Metadata extraction
  - Line item extraction
  - SKU semantic matching
  - Proposal formatting

### **Proposal Export**

- HTML (default)
- PDF (Puppeteer)
- DOCX (html-to-docx)

---

# 📦 Setup & Installation

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/yourusername/rfp-velocity.git
cd rfp-velocity
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Create `.env` File

```
GROQ_API_KEY=your_key_here
PORT=3000
```

### 4️⃣ Start the Server

```bash
npm start
```

### 5️⃣ Open in Browser

```
http://localhost:3000
```

---

# 🔄 How It Works

### **Step 1 — Upload SKU Catalog (CSV)**

System loads:

- skuCode
- name
- description
- packSize
- category
- baseCost

Stored in-memory for matching.

### **Step 2 — Paste RFP Raw Text**

AI extracts:

- Buyer
- Deadline
- Summary
- Requirements
- Disqualification conditions
- Line items

### **Step 3 — Run AI Matching**

- Hybrid candidate selection
- LLM-powered decision
- Confidence scoring
- Assigns `matchedSkuId` per line item

### **Step 4 — Pricing**

- Apply margin %
- Auto-calc unit + total price

### **Step 5 — Proposal Generation**

- Clean HTML output
- Professionally formatted
- Export options:
  - `.html`
  - `.pdf`
  - `.docx`

---

# 🧬 API Endpoints

### **POST /api/skus/upload-csv**

Upload SKU catalog.

### **POST /api/rfp/analyze**

Extract metadata + line items.

### **POST /api/rfp/:id/match**

Runs AI SKU matching with Groq.

### **POST /api/rfp/:id/generate**

Generates proposal + pricing.

### **POST /api/rfp/:id/download/pdf**

Download proposal as PDF.

### **POST /api/rfp/:id/download/docx**

Download proposal as DOCX.

---

# 📁 File Formats

### SKU CSV Example:

```
skuCode,name,description,packSize,category,baseCost
LEMON_500,Lemon Soda 500ml PET,Lemon drink,500ml,Beverages,18
```

### RFP Input

Raw text pasted into textarea.

### Proposal Output

- Clean HTML
- PDF (A4)
- DOCX (Word format)

---

# 🔮 Future Enhancements

### Phase 2

- PDF parsing support
- Dynamic proposal themes
- Multi-user accounts
- Role-based approvals

### Phase 3

- ERP Integration (SAP/Zoho)
- Vendor portal submission automation
- Analytics dashboard

### Phase 4

- Fully autonomous RFP agents
- Competitive pricing prediction
- Win-rate optimization

---

# 👥 Contributors

- **Tarun** — AI Architecture, Backend
- **(Add teammates)** — UI/UX, Frontend, QA
- **Echo (ChatGPT)** — Technical guidance & architecture support

---

# 🙏 Acknowledgements

Thanks to **Groq**, **Node.js**, and **open-source contributors** enabling rapid AI experimentation.

---

# 📣 Final Note

RFP Velocity demonstrates how Agentic AI can turn long, error-prone RFP workflows into a **streamlined, automated, business-winning pipeline**.

Feel free to fork, improve, or integrate into real production workflows!
