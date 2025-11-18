# MyToDoList

Application web PHP simple permettant de créer et gérer des listes de
tâches publiques et privées.\
Basée sur une architecture MVC (dossiers `Controleurs`, `Modeles`,
`Vues`) avec un point d'entrée unique : `index.php`.

## ✨ Fonctionnalités principales

-   Deux types d'acteurs : **Visiteur** et **Utilisateur** (connecté).
-   Création / suppression de **listes** et de **tâches publiques**.
-   L'utilisateur connecté peut créer/supprimer des **tâches privées**.
-   Une tâche peut être **cochée** → elle devient « terminée » après
    validation :
    -   Les tâches terminées apparaissent après les tâches actives.
    -   Elles ne peuvent plus être modifiées.
-   Impossible de convertir une tâche privée en tâche publique.

## 📁 Structure du projet

    MyToDoList/
    ├─ Controleurs/
    ├─ Modeles/
    ├─ Vues/
    ├─ index.php
    └─ README.md

## 🛠️ Prérequis

-   PHP 7.4+ ou 8.x
-   Serveur web (Apache/Nginx) ou serveur intégré PHP
-   Base de données si utilisée (MySQL/MariaDB/SQLite)

## 🚀 Installation en local

1.  Cloner :

        git clone https://github.com/Destroyeur6315/MyToDoList.git
        cd MyToDoList

2.  Configurer la base (si utilisée) :

        cp config.example.php config.php

3.  Lancer :

        php -S localhost:8000

## 🐳 Lancement avec Docker

### Dockerfile

    FROM php:8.2-apache
    RUN docker-php-ext-install pdo pdo_mysql
    COPY . /var/www/html
    EXPOSE 80

### docker-compose.yml

    version: '3.8'
    services:
      app:
        build: .
        container_name: mytodolist_app
        ports:
          - "8080:80"
        volumes:
          - .:/var/www/html
        depends_on:
          - db

      db:
        image: mysql:8.0
        container_name: mytodolist_db
        restart: always
        environment:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: todolist
          MYSQL_USER: user
          MYSQL_PASSWORD: password
        ports:
          - "3306:3306"

      phpmyadmin:
        image: phpmyadmin/phpmyadmin
        container_name: mytodolist_phpmyadmin
        restart: always
        environment:
          PMA_HOST: db
          MYSQL_ROOT_PASSWORD: root
        ports:
          - "8081:80"

### Lancement

    docker compose up -d

Accès : - App : http://localhost:8080\
- phpMyAdmin : http://localhost:8081

## 🤝 Contribution

Fork → Branche → PR.

## 📜 Licence

À définir.

## 👤 Auteur

**Destroyeur6315**
