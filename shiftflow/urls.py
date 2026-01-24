from django.contrib import admin
#  path() defines a URL route.
# include() loads URL routes from another app (splits URLs into multiple files).
from django.urls import include, path
# Gives access to project settings like DEBUG.
from django.conf import settings
# Helper to serve static files (CSS/JS/images) in development.
from django.contrib.staticfiles.urls import staticfiles_urlpatterns

# The project’s main list of URL routes.
# 
urlpatterns = [
    # (optional but common) an auto-generated management website for your database models
    path("admin/", admin.site.urls),
    # “start matching from the site root (/) using the URL patterns in those apps
    path("", include("apps.accounts.urls")),
    path("", include("apps.scheduling.urls")),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()

# For HTTP requests handled by Django: yes, 
# URL resolving starts at urls.py (your ROOT_URLCONF), 
# then goes into included app urls.py, then calls the matched view.
# Static files in production usually don’t go through Django
# (they’re served by the web server/CDN). In DEBUG=True, Django 
# can serve them because you add staticfiles_urlpatterns().