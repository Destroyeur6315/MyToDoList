<?php

// ⚠️ Adapter si besoin selon ton config.php
$dsn = "mysql:host=db;port=3306;dbname=todolist;charset=utf8";
$user = "user";
$pass = "password";

try {
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "Connexion OK<br>";

    // Table Liste (listes d'un utilisateur)
    $sqlListe = "
        CREATE TABLE IF NOT EXISTS liste (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nom VARCHAR(255) NOT NULL,
            possesseur VARCHAR(255) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    ";

    $pdo->exec($sqlListe);
    echo "Table Liste OK<br>";

    // Table Tache (tâches appartenant à une liste)
    $sqlTache = "
        CREATE TABLE IF NOT EXISTS tache (
            id INT AUTO_INCREMENT PRIMARY KEY,
            description VARCHAR(255) NOT NULL,
            idListe INT NOT NULL,
            termine TINYINT(1) NOT NULL DEFAULT 0,
            CONSTRAINT fk_tache_liste FOREIGN KEY (idListe) REFERENCES liste(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    ";

    $pdo->exec($sqlTache);
    echo "Table Tache OK<br>";

    // Table Utilisateur
    $sqlUtilisateur = "
        CREATE TABLE IF NOT EXISTS utilisateur (
            pseudo VARCHAR(255) PRIMARY KEY,
            password VARCHAR(255) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    ";

    $pdo->exec($sqlUtilisateur);
    echo "Table Utilisateur OK<br>";

    // Ajouter un utilisateur "test" / "test"
    $pseudo = "user63";
    $password = "password63";

    // Vérifie si l'utilisateur existe déjà
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM utilisateur WHERE pseudo = :pseudo");
    $stmt->execute(['pseudo' => $pseudo]);
    if ($stmt->fetchColumn() == 0) {
        $stmtInsert = $pdo->prepare("INSERT INTO utilisateur (pseudo, password) VALUES (:pseudo, :password)");
        $stmtInsert->execute([
            'pseudo' => $pseudo,
            'password' => $password
        ]);
        echo "Utilisateur 'test' ajouté.<br>";
    } else {
        echo "Utilisateur 'test' existe déjà.<br>";
    }

    echo "<br>Installation terminée.";

} catch (PDOException $e) {
    echo "Erreur PDO : " . $e->getMessage();
}