<?

class UtilisateurGateway{

    private $con;

    public function __construct(Connection $con)
    {
        $this->con = $con;
    }

    public function getUtilisateur($pseudo, $motDePasse){
        $query = 'SELECT * FROM utilisateur WHERE pseudo=:pseudo AND password=:password';

        $this->con->executeQuery($query, array(
            'pseudo' => array($pseudo, PDO::PARAM_STR),
            'password' => array($motDePasse, PDO::PARAM_STR)
        ));

        $result = $this->con->getResults();
        return $result;
    }

}








?>