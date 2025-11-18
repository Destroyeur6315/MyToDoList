# MyToDoList

Application web PHP simple permettant de créer et gérer des listes de tâches publiques et privées.\
Basée sur une architecture MVC (dossiers `Controleurs`, `Modeles`, `Vues`) avec un point d'entrée unique : `index.php`.

## ✨ Fonctionnalités principales

-   Deux types d'acteurs : **Visiteur** et **Utilisateur** (connecté).
-   Création / suppression de **listes** et de **tâches publiques**.
-   L'utilisateur connecté peut créer/supprimer des **tâches privées**.
-   Une tâche peut être **cochée** → elle devient « terminée » après
    validation :
    -   Les tâches terminées apparaissent après les tâches actives.
    -   Elles ne peuvent plus être modifiées.

## ✨ Fonctionnalités à venir

-   Convertir une tâche privée en tâche publique.
-   Créer un compte utilisateur
-   Utiliser des secrets pour les identifiants de MySQL
-   Hacher le mot de passe dans la base de données pour plus de sécurité
-   Utiliser une authentification plus robuste comme JWT, OAuth2.0...

## 📁 Structure du projet

    MyToDoList/
    ├─ Controleurs/
    ├─ Modeles/
    ├─ Vues/
    ├─ index.php
    └─ README.md

## 🛠️ Prérequis

-   Seulement Docker

## 🐳 Lancement avec Docker

1.  Cloner :

        git clone https://github.com/Destroyeur6315/MyToDoList.git
        cd MyToDoList

2.  Lancer les services docker :

        docker compose

3.  Executer le fichier setup.php pour créer la base de données:

        http://localhost:8080/setup.php

4.  L'appication est disponible à http://localhost:8080

Pour administrer la base de données, un phpMyAdmin est disponible à http://localhost:8081 avec user/password comme identifiant

Sur l'application, vous pouvez vous logger à un compte utilisateur par défaut avec les identifiants suivant :
- Username = user63
- Password = password63

## 📜 Licence

MIT licence.

## 👤 Auteur

**Destroyeur6315**
