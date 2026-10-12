# CCC Library Management System

Node.js/Express API backed by JSON files, with the existing web interface served from `public/`.

## Setup

1. Install Node.js 18 or newer.
2. In the project folder, run `npm install`.
3. Replace `JWT_SECRET` in `server/.env` with a long random secret before using this outside local development.
4. Run `npm run seed` to create the single admin and sample accession-number books.
5. Run `npm start` (or `npm run dev` during development), then open <http://localhost:3000>.

Seed credentials: `admin@ccc.edu.ph` / `Admin@CCC2026`. The seed prints the full bcrypt hash and validates the password. The first login requires a password change. No sample users are seeded. The app stores JSON data in `server/data/`.

URLs: shared login and sign-up at <http://localhost:3000/> and <http://localhost:3000/portal/signup.html>; Admin Panel at <http://localhost:3000/admin/home.html>; User Portal at <http://localhost:3000/portal/home.html>.

## API endpoints

All API responses use `{ "success", "data", "message" }`. Except register/login and health, endpoints require `Authorization: Bearer <JWT>`. Portal endpoints are limited to student/faculty/staff roles and their own data. Admin endpoints require admin/librarian. `passwordHash` is never returned.

| Method | Endpoint | Access / purpose |
| --- | --- | --- |
| GET | `/api/health` | API health check |
| POST | `/api/auth/register` | Public sign-up; creates a pending account |
| POST | `/api/auth/login` | Sign in; returns an 8-hour role JWT and records login |
| POST | `/api/auth/logout` | Close the active login record |
| PUT | `/api/auth/change-password` | Change password; current password + new password (8+ chars) |
| GET | `/api/auth/me` | Current account |
| GET | `/api/portal/dashboard` | Portal borrow count, due soon, overdue |
| GET | `/api/portal/books?q=&category=` | Portal read-only catalog search |
| GET | `/api/portal/my-books` | Signed-in user's current loans |
| GET | `/api/portal/history` | Signed-in user's own history |
| GET/PUT | `/api/portal/profile` | View/update signed-in user's own profile |
| GET | `/api/admin/users?q=&role=&status=` | Admin/librarian account list with filters |
| POST | `/api/admin/users` | Admin-created active account |
| PUT | `/api/admin/users/:id/approve` | Approve pending sign-up |
| PUT | `/api/admin/users/:id/reject` | Reject pending sign-up |
| PUT | `/api/admin/users/:id/status` | Activate/deactivate (cannot deactivate self) |
| PUT | `/api/admin/users/:id` | Edit user profile |
| PUT | `/api/admin/users/:id/reset-password` | Set temporary password; force change next login |
| PUT | `/api/admin/users/:id/rfid` | Assign/change/clear unique user RFID UID |
| DELETE | `/api/admin/users/:id` | Delete account (cannot delete self) |
| GET/POST | `/api/admin/books` | Search/list or add accession-number books |
| PUT/DELETE | `/api/admin/books/:id` | Edit/delete; deletion blocked while borrowed |
| POST | `/api/rfid/scan` | Identify a user by RFID UID |
| POST | `/api/rfid/entry` | Log student entry by RFID UID |
| POST | `/api/transactions/borrow` | Counter checkout `{ "rfidUid", "accessionNo" }`; due in 7 days |
| POST | `/api/transactions/return` | Counter return `{ "rfidUid", "accessionNo" }` |
| GET | `/api/transactions?limit=10` | Newest transactions |
| GET | `/api/logs` | Newest system login/activity records |
| GET | `/api/dashboard` | Dashboard counts and recent activity |
| POST | `/api/mobile/login` | Student app sign-in; optional `deviceToken` |
| GET | `/api/mobile/my-books` | Student's current borrowed books |
| GET | `/api/mobile/books?q=` | Search books |
| GET | `/api/mobile/history` | Student's own transaction history |

## Smoke-test with curl

Start the server and seed data first. Use the returned token in place of `<JWT>`:

```sh
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@ccc.edu.ph","password":"Admin@CCC2026"}'
curl http://localhost:3000/api/admin/books -H "Authorization: Bearer <JWT>"
curl -X POST http://localhost:3000/api/transactions/borrow -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"rfidUid":"<ASSIGNED_USER_RFID>","accessionNo":"ACC-0001"}'
curl -X POST http://localhost:3000/api/transactions/return -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"rfidUid":"<ASSIGNED_USER_RFID>","accessionNo":"ACC-0001"}'
curl http://localhost:3000/api/dashboard -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/logs -H "Authorization: Bearer $TOKEN"
```

### End-to-end test flow

1. Register a student. The account starts as `pending`; its password is stored as a bcrypt hash and it cannot sign in yet. Retry the same email to verify the `409 Email already registered` response.

   ```sh
   curl -i -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{"firstName":"Test","lastName":"Student","email":"student.test@ccc.edu.ph","password":"Student@123"}'
   curl -i -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{"firstName":"Test","lastName":"Student","email":"student.test@ccc.edu.ph","password":"Student@123"}'
   # Verify server/data/tbl_user.json contains status "pending" and a bcrypt passwordHash (never a plain password).
   ```

2. Sign in as the seeded admin. On its first login, change the temporary password with `PUT /api/auth/change-password` and use the newly returned token for admin requests.

   ```sh
   curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"student.test@ccc.edu.ph","password":"Student@123"}'
   # The response should be 403: "Your account is waiting for admin approval."
   curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@ccc.edu.ph","password":"Admin@CCC2026"}'
   curl -X PUT http://localhost:3000/api/auth/change-password -H "Authorization: Bearer <INITIAL_ADMIN_JWT>" -H "Content-Type: application/json" -d '{"currentPassword":"Admin@CCC2026","newPassword":"Library@2026"}'
   ```

3. Using the new admin token, approve the saved student ID and assign a unique RFID UID.

   ```sh
   # Find the student's id using the admin account list (filter by email), then approve and assign RFID.
   curl "http://localhost:3000/api/admin/users?q=student.test@ccc.edu.ph" -H "Authorization: Bearer <ADMIN_JWT>"
   curl -X PUT http://localhost:3000/api/admin/users/<STUDENT_ID>/approve -H "Authorization: Bearer <ADMIN_JWT>"
   curl -X PUT http://localhost:3000/api/admin/users/<STUDENT_ID>/rfid -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" -d '{"rfidUid":"CCC-TEST-001"}'
   ```

4. At the counter, borrow a sample book by scanning the user's RFID card and entering its accession number. Then sign in to the portal as the student and request My Books.

   ```sh
   curl -X POST http://localhost:3000/api/transactions/borrow -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" -d '{"rfidUid":"CCC-TEST-001","accessionNo":"ACC-0001"}'
   curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"student.test@ccc.edu.ph","password":"Student@123"}'
   curl http://localhost:3000/api/portal/my-books -H "Authorization: Bearer <STUDENT_JWT>"
   ```

The portal is read-only for borrowing. Checkout and return happen at the library counter; RFID identifies the person, while the book is identified by accession number.
