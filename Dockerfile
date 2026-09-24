# PHP + Apache image that serves the whole site (static pages and the PHP API)
FROM php:8.3-apache

# Trip times are Uganda local time; SQLite's 'localtime' uses the system zone
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
ENV TZ=Africa/Kampala
RUN echo "date.timezone=Africa/Kampala" > /usr/local/etc/php/conf.d/timezone.ini

COPY . /var/www/html/

# The SQLite database lives here and must be writable by Apache
RUN mkdir -p /var/www/html/php-rebuild/backend/api/data \
    && chown -R www-data:www-data /var/www/html/php-rebuild/backend/api/data

EXPOSE 80

# Listen on Render's $PORT (80 locally), create the database once, then start Apache
CMD sed -i "s/Listen 80/Listen ${PORT:-80}/" /etc/apache2/ports.conf \
    && sed -i "s/:80>/:${PORT:-80}>/" /etc/apache2/sites-available/000-default.conf \
    && su www-data -s /bin/sh -c "php /var/www/html/php-rebuild/backend/api/init_db.php" \
    && apache2-foreground
