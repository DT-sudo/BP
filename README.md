# ShiftSync - Shift Management System

## Project Structure

```
BP/
├── backend/                    # Django backend application
│   ├── apps/                  # Django applications
│   │   ├── accounts/          # User authentication & authorization
│   │   └── scheduling/        # Shift management logic
│   │       ├── views/         # Modular view functions
│   │       ├── models.py
│   │       ├── services.py
│   │       ├── forms.py
│   │       └── urls.py
│   ├── shiftflow/             # Django project settings
│   │   ├── settings.py        # Main configuration
│   │   ├── urls.py            # Root URL routing
│   │   └── wsgi.py
│   ├── manage.py              # Django management script
│   ├── db.sqlite3             # SQLite database
│   └── requirements.txt
│
├── frontend/                  # Frontend (static files & templates)
│   ├── static/                # Static assets
│   │   ├── css/
│   │   │   └── styles.css
│   │   ├── js/
│   │   │   ├── app.js
│   │   │   ├── manager-shifts.js      # Shift calendar logic (2500+ lines)
│   │   │   ├── manager-employees.js   # Employee management
│   │   │   ├── employee-shifts.js
│   │   │   ├── employee-unavailability.js
│   │   │   └── manager-shifts/        # Modular components (13 modules)
│   │   │       ├── config.js
│   │   │       ├── time-utils.js
│   │   │       ├── filters.js
│   │   │       └── ... (10 more modules)
│   │   └── media/
│   │
│   └── templates/             # Django HTML templates
│       ├── auth/
│       │   └── login.html
│       ├── employee/
│       ├── manager/
│       └── partials/          # Reusable template components
│
├── README.md                  # This file
└── manage.py                  # Wrapper script for backend/manage.py
```

## Getting Started

### Prerequisites
- Python 3.10+
- Django 5.2+

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd BP

# Install dependencies (create venv first if needed)
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Run migrations
python3 manage.py migrate

# Create superuser
python3 manage.py createsuperuser

# Load demo data (if available)
python3 manage.py loaddata initial_data
```

### Running the Development Server

```bash
# From project root
python3 manage.py runserver

# Or directly from backend/
cd backend
python3 manage.py runserver
```

Server will be available at `http://127.0.0.1:8000/`

## Project Architecture

### Backend (Django)
- **MVT Architecture** (Model-View-Template)
- **Modular Views**: views split into logical modules
  - `manager_shifts.py` - Shift scheduling interface
  - `manager_resources.py` - Position/template management
  - `employee.py` - Employee shift views
  - `helpers.py` - Shared utilities
- **Services Layer**: `services.py` handles business logic
- **SQLite Database** for development

### Frontend
- **Vanilla JavaScript** (no framework)
- **Responsive Design** with custom CSS
- **Interactive Components**:
  - Manager shift calendar (week/month/day views)
  - Employee shift picker
  - Unavailability calendar
  - Employee roster management

## Key Features

### For Managers
- 📅 **Shift Calendar** - View/create/edit shifts in week/month/day views
- 🔍 **Advanced Filtering** - Filter by position, status, availability
- 🔎 **Search** - Search shifts by position, date, time, capacity
- 👥 **Employee Management** - Add/edit/delete employees and assign shifts
- ⚙️ **Position Management** - Create and manage job roles

### For Employees
- 📅 **My Shifts** - View assigned shifts
- ❌ **Mark Unavailable** - Indicate days they can't work
- 📊 **Shift Statistics** - See upcoming shifts and hours

## Technologies Used

### Backend
- Django 5.2 - Web framework
- SQLite - Database
- Python 3.12 - Language

### Frontend
- HTML5 - Markup
- CSS3 - Styling
- Vanilla JavaScript - Interactivity (no build tools needed)

## Development Notes

### JavaScript Modular Structure
The `frontend/static/js/manager-shifts/` folder contains 13 modular components:
- Each module handles a specific feature
- Global namespace exports for browser compatibility
- No ES6 modules or build tools required

### Django Settings
- `STATIC_ROOT` points to `frontend/static/`
- `TEMPLATES` points to `frontend/templates/`
- Database at `backend/db.sqlite3`
- Settings in `backend/shiftflow/settings.py`

## Demo Credentials

If demo data is loaded:
- **Manager**: Username `manager_demo` / Password `demo123`
- **Employee**: Username `employee_demo` / Password `demo123`

## File Locations

- **Main Settings**: `backend/shiftflow/settings.py`
- **URL Routing**: `backend/shiftflow/urls.py`
- **Manager Shifts Logic**: `frontend/static/js/manager-shifts.js` (2500+ lines)
- **Employee Management**: `frontend/static/js/manager-employees.js`
- **Search Function**: Search implemented in both manager pages
