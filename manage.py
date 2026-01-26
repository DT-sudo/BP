#!/usr/bin/env python
"""
Wrapper script to run manage.py from backend/ directory.
This allows running: python manage.py (from project root) instead of: python backend/manage.py
"""
import os
import sys
import subprocess

if __name__ == "__main__":
    # Change to backend directory and run manage.py
    backend_dir = os.path.join(os.path.dirname(__file__), 'backend')
    manage_py = os.path.join(backend_dir, 'manage.py')
    
    # Run the backend manage.py with all arguments
    result = subprocess.run([sys.executable, manage_py] + sys.argv[1:])
    sys.exit(result.returncode)
