## Question 11. Number Of Movies Per Genre
Design Document
_design/schema-b

Index name
movies-by-genre

function (doc) {
  if('docs' in doc) {
    doc.docs.forEach(function(movie) {
      if(movie.type === "movie" && movie.genres) {
        movie.genres.forEach(function(genre) {
          emit(genre, 1);
        });
      }
    });
  }
}

Reduce
_sum