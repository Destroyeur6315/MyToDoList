# MyToDoList

Application web PHP simple permettant de créer et gérer des listes de tâches publiques et privées réalisé lors de mon BUT informatique.\
Basée sur une architecture MVC (dossiers `Controleurs`, `Modeles`, `Vues`) avec un point d'entrée unique : `index.php`.

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

    docker compose up -d

Accès :
- App : http://localhost:8080\
- phpMyAdmin : http://localhost:8081


## 📜 Licence

MIT licence.

## 👤 Auteur

**Destroyeur6315**
