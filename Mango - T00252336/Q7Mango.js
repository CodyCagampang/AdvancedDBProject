## Question 7. Movies with two specified actors

{
  "selector": {
   "docs": {
     "$elemMatch": {
       "actors": {
         "$all": [
           "Carrie Fisher",
           "Harrison Ford"
           ]
       }
     }
   }
  }
}
    

