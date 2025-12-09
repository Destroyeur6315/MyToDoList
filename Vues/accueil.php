<html>
<head>
    <title>My ToDoList</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            flex-direction: column;
        }

        .main-content {
            flex: 1;
        }

        /* Header */
        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 20px 40px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
        }

        .brand {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
            text-decoration: none;
        }

        .nav-links {
            display: flex;
            gap: 25px;
            list-style: none;
        }

        .nav-links a {
            color: #333;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s;
        }

        .nav-links a:hover {
            color: #667eea;
        }

        .sign-in {
            background: #667eea;
            color: white;
            padding: 10px 25px;
            border-radius: 25px;
            text-decoration: none;
            transition: transform 0.3s, box-shadow 0.3s;
        }

        .sign-in:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        /* Add List Form */
        .add-list-container {
            max-width: 600px;
            margin: 0 auto 40px;
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .add-list-form {
            display: flex;
            gap: 10px;
        }

        .add-list-form input[type="text"] {
            flex: 1;
            padding: 15px 20px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        .add-list-form input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.3s, box-shadow 0.3s;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        /* TodoLists Grid */
        .lists-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 30px;
            max-width: 1400px;
            margin: 0 auto;
        }

        .todolist-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s, box-shadow 0.3s;
            display: flex;
            flex-direction: column;
            min-height: 400px;
        }

        .todolist-card:hover {
            /* transform: translateY(-5px); */
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
        }

        .list-header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }

        .list-title {
            font-size: 24px;
            color: #333;
            margin-bottom: 15px;
        }

        .add-task-form {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
        }

        .add-task-form input[type="text"] {
            flex: 1;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
        }

        .add-task-form input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }

        .btn-add {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        }

        .btn-add:hover {
            background: #5568d3;
        }

        /* Tasks */
        .tasks-list {
            flex: 1;
            list-style: none;
            margin-bottom: 20px;
            overflow-y: auto;
            max-height: 400px;
        }

        .task-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background 0.3s;
        }

        .task-item:hover {
            background: #e9ecef;
        }

        .task-content {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }

        .task-checkbox {
            width: 20px;
            height: 20px;
            cursor: pointer;
            accent-color: #667eea;
        }

        .task-label {
            color: #333;
            font-size: 15px;
        }

        .task-completed {
            background: #d4edda;
        }

        .task-completed .task-label {
            text-decoration: line-through;
            color: #6c757d;
        }

        .btn-delete-task {
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.3s;
        }

        .btn-delete-task:hover {
            background: #c82333;
        }

        .completed-tasks {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
        }

        .completed-tasks-title {
            font-size: 14px;
            color: #6c757d;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .completed-task {
            padding: 8px 0;
            color: #6c757d;
            font-size: 14px;
        }

        /* Footer */
        .list-footer {
            margin-top: auto;
            padding-top: 15px;
            border-top: 2px solid #f0f0f0;
        }

        .btn-delete-list {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            border: none;
            padding: 12px;
            border-radius: 8px;
            width: 100%;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.3s, box-shadow 0.3s;
        }

        .btn-delete-list:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(245, 87, 108, 0.4);
        }

        /* Site Footer */
        .site-footer {
            background: rgba(255, 255, 255, 0.95);
            margin-top: 40px;
            padding: 20px;
            border-radius: 15px;
        }

        .footer-content {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 30px;
            margin-bottom: 30px;
        }

        .footer-section h6 {
            color: #333;
            font-size: 18px;
            margin-bottom: 15px;
        }

        .footer-section p,
        .footer-section a {
            color: #666;
            text-decoration: none;
            line-height: 1.8;
        }

        .footer-section a:hover {
            color: #667eea;
        }

        .footer-links {
            list-style: none;
        }

        .footer-bottom {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
        }

        .social-icons {
            display: flex;
            gap: 15px;
            list-style: none;
        }

        .social-icons a {
            width: 40px;
            height: 40px;
            background: #667eea;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            text-decoration: none;
            transition: transform 0.3s, background 0.3s;
        }

        .social-icons a:hover {
            transform: translateY(-3px);
            background: #764ba2;
        }

        @media (max-width: 768px) {
            .lists-container {
                grid-template-columns: 1fr;
            }

            .header {
                flex-direction: column;
                text-align: center;
            }

            .nav-links {
                flex-direction: column;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    
    <div class="main-content">

        <!-- Header -->
        <header class="header">
            <a href="#" class="brand">MyToDoList (public)</a>
            <nav>
                <ul class="nav-links">
                    <li><a href="">Accueil</a></li>
                    <li><a href="?action=avoirListePrive">Listes privées</a></li>
                </ul>
            </nav>
            <a href="?action=avoirPageConnexion" class="sign-in">Sign in</a>
        </header>

        <!-- Gestion erreur -->
        <?php
        if (isset($dVueEreur) && count($dVueEreur)>0) {
            echo '<div class="erreur" style="background-color: #f8d7da; color: #721c24; padding: 15px; border-radius: 10px; margin: 20px auto; max-width: 600px;">';
            echo "<h2>ERREUR</h2>";
            foreach ($dVueEreur as $value){
                echo $value;
                echo "<br>";
            }
            echo "</div>";
        }
        ?>

        <!-- Add List Form -->
        <div class="add-list-container">
            <form method="post" class="add-list-form">
                <input name="nomListe" type="text" placeholder="Nom de la nouvelle liste..." required>
                <input type="hidden" name="action" value="ajouterUneListe">
                <button type="submit" class="btn-primary">Créer une liste</button>
            </form>
        </div>

        <?php if (!empty($tab_liste)) : ?>

            <!-- TodoLists Grid -->
            <div class="lists-container">

                <?php foreach ($tab_liste as $liste) : ?>
                    <div class="todolist-card">
                        <div class="list-header">
                            <h2 class="list-title"><?php echo $liste->getNom(); ?></h2>
                            <form action="?idListe=<?php echo $liste->getId(); ?>" method="post" class="add-task-form">
                                <input name="NewTache" type="text" placeholder="Nouvelle tâche..." required>
                                <input type="hidden" name="action" value="ajouterUneTache">
                                <button type="submit" class="btn-add">Ajouter</button>
                            </form>
                        </div>

                        <ul class="tasks-list">
                            <?php foreach ($tab_tache as $tache) : ?>
                                <?php if($tache->getIdListe() == $liste->getId() && !$tache->getTermine()) : ?>
                                    <li class="task-item">
                                        <div class="task-content">
                                            <form action="?idTache=<?php echo $tache->getId(); ?>" method="post" style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                                <input type="checkbox" name="valide" class="task-checkbox" value="1" onchange="this.form.submit()">
                                                <label class="task-label"><?php echo $tache->getDescription(); ?></label>
                                                <input type="hidden" name="action" value="tacheChecked">
                                            </form>
                                        </div>
                                        <form action="?idTache=<?php echo $tache->getId(); ?>" method="post" style="display: inline;">
                                            <input type="hidden" name="action" value="supprimerUneTache">
                                            <button type="submit" class="btn-delete-task">✕</button>
                                        </form>
                                    </li>
                                <?php endif; ?>
                            <?php endforeach; ?>
                            
                            <?php 
                            $hasCompleted = false;
                            foreach($tab_tache as $tache) {
                                if($tache->getIdListe() == $liste->getId() && $tache->getTermine()) {
                                    if (!$hasCompleted) {
                                        echo '<div class="completed-tasks"><div class="completed-tasks-title">Tâches terminées</div>';
                                        $hasCompleted = true;
                                    }
                                    echo '<div class="completed-task">✓ '.$tache->getDescription().'</div>';
                                }
                            }
                            if ($hasCompleted) {
                                echo '</div>';
                            }
                            ?>
                        </ul>

                        <div class="list-footer">
                            <form action="?idListe=<?php echo $liste->getId(); ?>" method="post">
                                <input type="hidden" name="action" value="supprimerUneListe">
                                <button type="submit" class="btn-delete-list">Supprimer la liste</button>
                            </form>
                        </div>
                    </div>
                <?php endforeach; ?>
            
            </div>
    </div>

    <?php else : ?>

        <div style="text-align:center; margin:50px 0;">
            <span style="
                display:inline-block;
                font-size:36px;
                font-weight:bold;
                color:#888;
                transform:rotate(-5deg);
                opacity:0.7;
                font-family: 'Arial', sans-serif;
            ">
                Aucune tâche pour le moment<br>🎉 Ta to-do list est vide !
            </span>
        </div>

    <?php endif; ?>
    <!-- Fin main-content -->

    <!-- Footer -->
    <footer class="site-footer">
        <!-- <div class="footer-content">
            <div class="footer-section">
                <h6>About</h6>
                <p>Just a web application for people who want a ToDoList</p>
            </div>

            <div class="footer-section">
                <h6>Categories</h6>
                <ul class="footer-links">
                    <li><a href="http://scanfcode.com/category/back-end-development/">PHP</a></li>
                    <li><a href="http://scanfcode.com/category/templates/">Templates</a></li>
                </ul>
            </div>

            <div class="footer-section">
                <h6>Quick Links</h6>
                <ul class="footer-links">
                    <li><a href="#">About Us</a></li>
                </ul>
            </div>
        </div> -->

        <div class="footer-bottom">
            <p>Copyright © 2025 All Rights Reserved by <a href="#">Destroyeur6315</a></p>
            <ul class="social-icons">
                <li><a href="#"><i class="fa fa-facebook"></i></a></li>
                <li><a href="#"><i class="fa fa-twitter"></i></a></li>
                <li><a href="#"><i class="fa fa-dribbble"></i></a></li>
                <li><a href="#"><i class="fa fa-linkedin"></i></a></li>
            </ul>
        </div>
    </footer>

</body>
</html>