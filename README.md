# MediMate — Medicine Reminder & Health Record Management

**Simple healthcare management for patients and their families.**

MediMate is a web-based healthcare management application designed to help patients manage their medicines, keep track of health records, and support caregivers in monitoring medication routines.

## ✨ Features

- **Medicine Management** — Add and manage medicines and their scheduled timings.
- **Medicine Reminders** — Receive notifications to help you remember when to take your medicine.
- **Background Notifications** — Receive supported browser push notifications when the website tab is closed, subject to browser permissions and push configuration.
- **Patient Dashboard** — Access medicine schedules and healthcare information in one place.
- **Caregiver Support** — Help caregivers monitor medication routines and relevant patient information.
- **Health Records** — Organize and access health-related documents.
- **Responsive Interface** — Use the application through a web browser on supported devices.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Bootstrap 5 |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | JSON Web Tokens (JWT), bcrypt |
| File Management | Cloudinary, Multer |
| Background Scheduling | node-cron |
| Push Notifications | Browser Service Workers and Web Push, where configured |
| Deployment | Render |
| Automation | GitHub Actions |

## 🚀 Live Demo

**Application:** https://medimate-9v40.onrender.com

The live application may take some time to respond after a period of inactivity when hosted on a free service.

## ⚙️ Run Locally

### Prerequisites

Install the following before starting:

- Node.js and npm
- MongoDB Atlas account or a local MongoDB instance
- Git

### 1. Clone the repository

```bash
git clone https://github.com/mundrumeghana04/MediMate.git
cd MediMate
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root using the environment variable names expected by the application. Check the project's environment configuration or `.env.example` file, if available.

Typical configuration may include database connection details, authentication secrets, file-storage credentials, and push-notification keys.

**Important:** Never commit `.env` files, passwords, private keys, or production credentials to GitHub.

### 4. Start the application

```bash
npm start
```

Open the local URL printed by the server in your terminal. The default is often `http://localhost:3000`, but use the port configured by the project.

## 🔔 Notification Setup

For browser notifications to work:

1. Open MediMate in a supported browser.
2. Allow notifications for the website.
3. Ensure the browser push subscription is registered if push notifications are enabled.
4. Configure the required push credentials and backend environment variables.
5. Verify that the backend scheduler is running and that reminder times are configured correctly.

Notification delivery depends on browser permissions, push-service availability, backend configuration, and device settings.

## ☁️ Deployment

MediMate is deployed using Render.

A typical deployment process includes:

1. Connect the GitHub repository to Render.
2. Configure the build and start commands.
3. Add the required environment variables securely in Render.
4. Ensure the production database is accessible.
5. Deploy the application and verify login, medicine persistence, and scheduled reminders.

GitHub Actions can be used for scheduled automation when configured in the repository.

## 🔐 Security and Privacy

- Keep authentication secrets and database credentials private.
- Use secure password hashing and authenticated routes.
- Restrict access to patient information according to user roles.
- Store uploaded files through the configured file-storage service.
- Avoid including real patient records or sensitive information in public demonstrations.

## 🎯 Project Objective

The goal of MediMate is to make everyday medicine management simpler and more accessible while helping patients and caregivers organize medication schedules and health information through a single web application.

## 👩‍💻 Author

**Meghana Mundru**

Integrated M.Tech — Computer Science and Engineering  
VIT-AP University

---

*Built to make medicine management and healthcare organization easier for patients and their families.*
